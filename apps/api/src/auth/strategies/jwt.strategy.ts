import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';

export interface JwtAccessPayload {
  sub: string; // userId
  tokenType: 'access';
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  roleCodes: string[];
  allow: string[]; // "resource:action"
  deny: string[];
  factoryIds: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.accessSecret', { infer: true }),
    });
  }

  /**
   * Re-fetches the user, role permissions, and factory access fresh from the
   * database on every request rather than trusting claims embedded in the JWT.
   * The access token is short-lived (15m default) specifically so this stays cheap
   * and a deactivated/edited account is locked out within one token lifetime.
   */
  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.raw.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
        permissionOverrides: true,
        factoryAccess: true,
      },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const allow = new Set<string>();
    const roleCodes: string[] = [];
    for (const userRole of user.roles) {
      roleCodes.push(userRole.role.code);
      for (const permission of userRole.role.permissions) {
        allow.add(`${permission.resource}:${permission.action}`);
      }
    }

    const deny = new Set<string>();
    for (const override of user.permissionOverrides) {
      const key = `${override.resource}:${override.action}`;
      if (override.effect === 'ALLOW') allow.add(key);
      else deny.add(key);
    }

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
      roleCodes,
      allow: Array.from(allow),
      deny: Array.from(deny),
      factoryIds: user.factoryAccess.map((fa) => fa.factoryId),
    };
  }
}
