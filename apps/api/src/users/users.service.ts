import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { generateOpaqueToken, hashPassword } from '../auth/password.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SET_PASSWORD_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
  factoryAccess: { select: { factory: { select: { id: true, name: true, code: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async inviteUser(dto: InviteUserDto) {
    const existing = await this.prisma.raw.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException(`A user with email "${dto.email}" already exists`);

    // Scoped reads: a role/factory ID belonging to a different tenant simply won't
    // be found here, so a caller can never smuggle another tenant's role in.
    const roles = await this.prisma.db.role.findMany({ where: { id: { in: dto.roleIds } } });
    if (roles.length !== dto.roleIds.length) throw new NotFoundException('One or more roleIds are invalid');

    if (dto.factoryIds?.length) {
      const factories = await this.prisma.db.factory.findMany({ where: { id: { in: dto.factoryIds } } });
      if (factories.length !== dto.factoryIds.length) throw new NotFoundException('One or more factoryIds are invalid');
    }

    const placeholderPasswordHash = await hashPassword(randomBytes(32).toString('hex'));
    const user = await this.prisma.db.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        passwordHash: placeholderPasswordHash,
        status: 'INVITED',
        roles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
        factoryAccess: { create: (dto.factoryIds ?? []).map((factoryId) => ({ factoryId })) },
      },
    });

    const { token, tokenHash } = generateOpaqueToken();
    await this.prisma.raw.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS) },
    });

    const frontendUrl = this.configService.get('corsOrigin', { infer: true });
    await this.mailService.sendWelcome(user.email, user.firstName, `${frontendUrl}/reset-password?token=${token}`);
    await this.auditService.log({
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      newValue: { email: user.email, roleIds: dto.roleIds },
    });

    return { id: user.id, email: user.email, status: user.status };
  }

  async listUsers(query: PaginationQueryDto) {
    const where = query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.db.user.findMany({
        where,
        select: USER_LIST_SELECT,
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.db.user.count({ where }),
    ]);

    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getUserById(id: string) {
    const user = await this.prisma.db.user.findUnique({ where: { id }, select: USER_LIST_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const existing = await this.getUserById(id);

    if (dto.roleIds) {
      const roles = await this.prisma.db.role.findMany({ where: { id: { in: dto.roleIds } } });
      if (roles.length !== dto.roleIds.length) throw new NotFoundException('One or more roleIds are invalid');
    }
    if (dto.factoryIds) {
      const factories = await this.prisma.db.factory.findMany({ where: { id: { in: dto.factoryIds } } });
      if (factories.length !== dto.factoryIds.length) throw new NotFoundException('One or more factoryIds are invalid');
    }

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          status: dto.status,
        },
      });

      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: dto.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      if (dto.factoryIds) {
        await tx.userFactoryAccess.deleteMany({ where: { userId: id } });
        await tx.userFactoryAccess.createMany({ data: dto.factoryIds.map((factoryId) => ({ userId: id, factoryId })) });
      }

      return user;
    });

    if (dto.status === 'INACTIVE' || dto.status === 'LOCKED') {
      await this.prisma.raw.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: dto as unknown as Record<string, unknown>,
    });

    return this.getUserById(updated.id);
  }
}
