import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { generateOpaqueToken, hashPassword, hashToken, verifyPassword } from './password.util';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.raw.user.findUnique({ where: { email } });

    const invalidCredentials = () => new UnauthorizedException('Invalid email or password');

    if (!user || user.deletedAt) {
      throw invalidCredentials();
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      await this.prisma.raw.loginHistory.create({
        data: { userId: user.id, success: false, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
      });
      throw invalidCredentials();
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active. Contact your administrator.');
    }

    await this.prisma.raw.$transaction([
      this.prisma.raw.loginHistory.create({
        data: { userId: user.id, success: true, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
      }),
      this.prisma.raw.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    const tokens = await this.issueTokens(user.id, meta);
    return { user: this.toPublicUser(user), ...tokens };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokens & { userId: string }> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.raw.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    // Rotation: revoke the used token and issue a new pair, so a stolen-and-replayed
    // refresh token is detectable (its rotated successor won't match on next use).
    await this.prisma.raw.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issueTokens(stored.userId, meta);
    return { userId: stored.userId, ...tokens };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.raw.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.auditService.log({ action: 'LOGOUT' });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.raw.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.raw.$transaction([
      this.prisma.raw.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.raw.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'User',
      entityId: userId,
      newValue: { passwordChanged: true },
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.raw.user.findUnique({ where: { email } });
    // Always behave the same whether or not the account exists — prevents user
    // enumeration via response timing/content.
    if (!user || user.deletedAt || user.status !== 'ACTIVE') return;

    const { token, tokenHash } = generateOpaqueToken();
    await this.prisma.raw.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const frontendUrl = this.configService.get('corsOrigin', { infer: true });
    await this.mailService.sendPasswordReset(user.email, `${frontendUrl}/reset-password?token=${token}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const stored = await this.prisma.raw.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset link is invalid or expired');
    }

    const passwordHash = await hashPassword(newPassword);
    // Completing a reset activates a first-time INVITED account (this is exactly
    // how invited users and new tenant owners get their first working login), but
    // must never silently reactivate someone an admin deliberately set to INACTIVE
    // or LOCKED — a stale reset token shouldn't be a way around an admin lockout.
    const nextStatus = stored.user.status === 'INVITED' ? 'ACTIVE' : stored.user.status;

    await this.prisma.raw.$transaction([
      this.prisma.raw.user.update({ where: { id: stored.userId }, data: { passwordHash, status: nextStatus } }),
      this.prisma.raw.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      this.prisma.raw.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokens(userId: string, meta: RequestMeta): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, tokenType: 'access' },
      {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
        expiresIn: this.configService.get('jwt.accessExpiresIn', { infer: true }),
      },
    );

    const { token: refreshToken, tokenHash } = generateOpaqueToken();
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.raw.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: refreshTokenExpiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId: string | null;
    isPlatformAdmin: boolean;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
