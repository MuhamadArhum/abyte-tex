import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { TenantContextStore } from '../common/tenant-context';
import { seedTenantRoles } from '../roles/role-seed.util';
import { RoleCode } from '../common/rbac.constants';
import { generateOpaqueToken, hashPassword } from '../auth/password.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto, UpdateTenantStatusDto } from './dto/update-tenant.dto';

const SET_PASSWORD_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for a first-time invite

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /** Platform-admin only — provisions a new tenant business (SRS §3, MVP acceptance criteria). */
  async createTenant(dto: CreateTenantDto) {
    const existing = await this.prisma.raw.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`A tenant with slug "${dto.slug}" already exists`);
    }
    const existingUser = await this.prisma.raw.user.findUnique({ where: { email: dto.ownerEmail } });
    if (existingUser) {
      throw new ConflictException(`A user with email "${dto.ownerEmail}" already exists`);
    }

    const { tenant, owner, setPasswordToken } = await this.prisma.raw.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.companyName, slug: dto.slug },
      });

      const roles = await seedTenantRoles(tx, tenant.id);

      // Placeholder credential — unusable until the owner completes the set-password
      // flow below; login is blocked anyway while status is INVITED.
      const placeholderPasswordHash = await hashPassword(randomBytes(32).toString('hex'));
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.ownerEmail,
          firstName: dto.ownerFirstName,
          lastName: dto.ownerLastName,
          passwordHash: placeholderPasswordHash,
          status: 'INVITED',
          roles: { create: { roleId: roles[RoleCode.COMPANY_OWNER].id } },
        },
      });

      const { token, tokenHash } = generateOpaqueToken();
      await tx.passwordResetToken.create({
        data: { userId: owner.id, tokenHash, expiresAt: new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS) },
      });

      return { tenant, owner, setPasswordToken: token };
    });

    const frontendUrl = this.configService.get('corsOrigin', { infer: true });
    await this.mailService.sendWelcome(
      owner.email,
      owner.firstName,
      `${frontendUrl}/reset-password?token=${setPasswordToken}`,
    );

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'Tenant',
      entityId: tenant.id,
      newValue: { name: tenant.name, slug: tenant.slug },
    });

    return { tenant, owner: { id: owner.id, email: owner.email } };
  }

  /** Platform-admin only — lists all tenants across the platform. */
  async listTenants(query: PaginationQueryDto) {
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { slug: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.raw.tenant.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.raw.tenant.count({ where }),
    ]);

    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  /** Platform-admin only. */
  async getTenantById(id: string) {
    const tenant = await this.prisma.raw.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /** Platform-admin only — suspend/reactivate/cancel a tenant. */
  async updateTenantStatus(id: string, dto: UpdateTenantStatusDto) {
    const tenant = await this.getTenantById(id);
    const updated = await this.prisma.raw.tenant.update({ where: { id }, data: { status: dto.status } });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Tenant',
      entityId: id,
      oldValue: { status: tenant.status },
      newValue: { status: dto.status },
    });
    return updated;
  }

  /** Tenant users — fetches their own company settings (SRS §5.2). */
  async getOwnTenant() {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ForbiddenException('No tenant context');
    return this.getTenantById(ctx.tenantId);
  }

  /** Tenant users with tenant:UPDATE permission — updates their own company settings. */
  async updateOwnTenant(dto: UpdateTenantDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ForbiddenException('No tenant context');

    const before = await this.getTenantById(ctx.tenantId);
    // Cast: UpdateTenantDto is a scalar-only partial-update shape (Prisma's
    // "Unchecked" update variant); Prisma's generated XOR union can't always
    // resolve that from a DTO class on its own.
    const updated = await this.prisma.raw.tenant.update({
      where: { id: ctx.tenantId },
      data: dto as Prisma.TenantUncheckedUpdateInput,
    });
    await this.auditService.log({
      action: 'CONFIG_CHANGE',
      entityType: 'Tenant',
      entityId: ctx.tenantId,
      oldValue: before as unknown as Record<string, unknown>,
      newValue: dto as unknown as Record<string, unknown>,
    });
    return updated;
  }
}
