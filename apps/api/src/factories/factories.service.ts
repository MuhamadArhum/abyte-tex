import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';

@Injectable()
export class FactoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateFactoryDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Factories can only be created within a tenant context');

    const existing = await this.prisma.db.factory.findFirst({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`A factory with code "${dto.code}" already exists`);

    // tenantId is also auto-injected by the Prisma tenant-scoping extension (D-015);
    // it's spelled out here too so the create's TypeScript input type is satisfied
    // without a cast.
    const factory = await this.prisma.db.factory.create({ data: { ...dto, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Factory', entityId: factory.id, newValue: dto });
    return factory;
  }

  async list(query: PaginationQueryDto) {
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.db.factory.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.db.factory.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const factory = await this.prisma.db.factory.findUnique({ where: { id } });
    if (!factory) throw new NotFoundException('Factory not found');
    return factory;
  }

  async update(id: string, dto: UpdateFactoryDto) {
    const existing = await this.getById(id);
    const updated = await this.prisma.db.factory.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Factory',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }
}
