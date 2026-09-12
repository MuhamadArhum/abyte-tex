import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateProductCategoryDto } from './dto/product-category.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateProductDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Products can only be created within a tenant context');

    if (dto.categoryId) {
      const category = await this.prisma.db.productCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Product category not found');
    }

    const existing = await this.prisma.db.product.findFirst({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException(`A product with SKU "${dto.sku}" already exists`);

    const product = await this.prisma.db.product.create({ data: { ...dto, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Product', entityId: product.id, newValue: dto });
    return product;
  }

  async list(query: PaginationQueryDto) {
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { sku: { contains: query.search, mode: 'insensitive' as const } },
            { brand: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.db.product.findMany({
        where,
        include: { category: true },
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.db.product.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const product = await this.prisma.db.product.findUnique({ where: { id }, include: { category: true } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.getById(id);
    if (dto.categoryId) {
      const category = await this.prisma.db.productCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Product category not found');
    }

    const updated = await this.prisma.db.product.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Product',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }

  async createCategory(dto: CreateProductCategoryDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Categories can only be created within a tenant context');

    if (dto.parentId) {
      const parent = await this.prisma.db.productCategory.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.db.productCategory.create({ data: { ...dto, tenantId: ctx.tenantId } });
  }

  async listCategories() {
    return this.prisma.db.productCategory.findMany({ orderBy: { name: 'asc' } });
  }
}
