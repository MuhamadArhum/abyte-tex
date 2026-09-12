import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/update-sales-order-status.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createOrder(dto: CreateSalesOrderDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Sales orders can only be created within a tenant context');

    const customer = await this.prisma.db.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const factory = await this.prisma.db.factory.findUnique({ where: { id: dto.factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');

    const products = await this.prisma.db.product.findMany({
      where: { id: { in: dto.items.map((i) => i.productId) } },
    });
    if (products.length !== new Set(dto.items.map((i) => i.productId)).size) {
      throw new NotFoundException('One or more products were not found');
    }

    const itemsWithTotals = dto.items.map((item) => ({
      ...item,
      lineTotal: item.quantity * item.unitPrice - (item.discount ?? 0),
    }));
    const subtotal = itemsWithTotals.reduce((sum, i) => sum + i.lineTotal, 0);
    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const total = subtotal - discount + tax;

    const orderNumber = await this.generateOrderNumber();

    const order = await this.prisma.db.salesOrder.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: dto.factoryId,
        customerId: dto.customerId,
        orderNumber,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        subtotal,
        discount,
        tax,
        total,
        notes: dto.notes,
        items: {
          create: itemsWithTotals.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            discount: i.discount ?? 0,
            lineTotal: i.lineTotal,
          })),
        },
      },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } }, customer: true },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'SalesOrder',
      entityId: order.id,
      newValue: { orderNumber, total },
    });
    return order;
  }

  private async generateOrderNumber(): Promise<string> {
    const count = await this.prisma.db.salesOrder.count();
    return `SO-${String(count + 1).padStart(6, '0')}`;
  }

  async list(query: ListSalesOrdersQueryDto) {
    const where = {
      ...(query.factoryId ? { factoryId: query.factoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' as const } },
              { customer: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.salesOrder.findMany({
        where,
        include: { customer: { select: { id: true, name: true } }, items: true },
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.db.salesOrder.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const order = await this.prisma.db.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        factory: { select: { id: true, name: true, code: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    return order;
  }

  async updateStatus(id: string, dto: UpdateSalesOrderStatusDto) {
    const existing = await this.getById(id);
    const updated = await this.prisma.db.salesOrder.update({ where: { id }, data: { status: dto.status as never } });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'SalesOrder',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
    });
    return updated;
  }
}
