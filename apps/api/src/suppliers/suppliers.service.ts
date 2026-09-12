import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateSupplierDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Suppliers can only be created within a tenant context');

    const supplier = await this.prisma.db.supplier.create({ data: { ...dto, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Supplier', entityId: supplier.id, newValue: dto });
    return supplier;
  }

  async list(query: PaginationQueryDto) {
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { contactPerson: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.db.supplier.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.db.supplier.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const supplier = await this.prisma.db.supplier.findUnique({
      where: { id },
      include: { purchaseOrders: { select: { id: true, poNumber: true, status: true, total: true, orderDate: true } } },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const existing = await this.getById(id);
    const updated = await this.prisma.db.supplier.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Supplier',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }
}
