import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../common/idempotency.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { assertValidTransition } from '../common/workflow.util';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { SalesOrderStatus, UpdateSalesOrderStatusDto } from './dto/update-sales-order-status.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';

/**
 * P1 remediation (WF-001/WF-002): explicit manual-transition map per SRS §6.1.
 * QUALITY → READY is the one manual entry into READY ("passed quality, ready
 * to be picked for dispatch"); DISPATCHED is never a manual target anywhere
 * in this map — it is set only by `DispatchService.create()`, which also
 * re-sets READY on a partial delivery. Either way, a Sales Order can never
 * claim to be dispatched without a real `Dispatch` record backing it (closes
 * WF-002's exact concern). COMPLETED and CANCELLED are terminal — neither has
 * an entry in this map, so `assertValidTransition` rejects any transition out
 * of them.
 */
const SALES_ORDER_MANUAL_TRANSITIONS: Partial<Record<SalesOrderStatus, readonly SalesOrderStatus[]>> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PRODUCTION_PLANNED', 'CANCELLED'],
  PRODUCTION_PLANNED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['QUALITY', 'CANCELLED'],
  QUALITY: ['READY', 'CANCELLED'],
  READY: ['CANCELLED'],
  DISPATCHED: ['COMPLETED'],
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * P1 remediation (API-005): a repeated call with the same `idempotencyKey`
   * (a network retry, a double-click) returns the original order instead of
   * creating a second one. Omitting the key preserves the previous behavior.
   */
  async createOrder(dto: CreateSalesOrderDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Sales orders can only be created within a tenant context');

    const existingId = await this.idempotencyService.check('sales_order:create', dto.idempotencyKey);
    if (existingId) return this.getById(existingId);

    assertFactoryAccess(ctx, dto.factoryId);
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
    await this.idempotencyService.record('sales_order:create', dto.idempotencyKey, order.id);
    return order;
  }

  private async generateOrderNumber(): Promise<string> {
    const count = await this.prisma.db.salesOrder.count();
    return `SO-${String(count + 1).padStart(6, '0')}`;
  }

  async list(query: ListSalesOrdersQueryDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = {
      ...factoryScopeFilter(ctx, query.factoryId),
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
    assertFactoryAccess(TenantContextStore.getOrThrow(), order.factoryId);
    return order;
  }

  /**
   * P1 remediation (WF-001/WF-002): thin dispatcher preserving the existing
   * `PATCH /sales-orders/:id/status` contract, routing to an explicit,
   * independently-validated method per target status rather than writing
   * `dto.status` straight to the row. This is what makes "DRAFT → COMPLETED
   * in one call" (the exact case named in the remediation brief) impossible:
   * COMPLETED is only reachable via `complete()`, which requires the current
   * status to already be DISPATCHED per `SALES_ORDER_MANUAL_TRANSITIONS`.
   */
  async updateStatus(id: string, dto: UpdateSalesOrderStatusDto) {
    switch (dto.status) {
      case 'CANCELLED':
        return this.cancel(id, dto.reason);
      case 'COMPLETED':
        return this.complete(id);
      case 'CONFIRMED':
      case 'PRODUCTION_PLANNED':
      case 'IN_PRODUCTION':
      case 'QUALITY':
      case 'READY':
        // READY is a legal manual target only from QUALITY ("passed quality, ready to be
        // picked for dispatch") — SALES_ORDER_MANUAL_TRANSITIONS enforces that; it is not
        // universally system-only like DISPATCHED below.
        return this.advanceTo(id, dto.status);
      case 'DISPATCHED':
        throw new BadRequestException(
          `${dto.status} is set automatically when a Dispatch is created against this order, and cannot be set manually.`,
        );
      case 'DRAFT':
        throw new BadRequestException('A Sales Order cannot be moved back to DRAFT.');
      default:
        throw new BadRequestException(`Unknown target status: ${dto.status}`);
    }
  }

  /** Forward-progression transitions with no additional business condition beyond legality. */
  private async advanceTo(id: string, next: SalesOrderStatus) {
    const existing = await this.getById(id);
    assertValidTransition('Sales Order', existing.status, next, SALES_ORDER_MANUAL_TRANSITIONS);

    const updated = await this.prisma.db.salesOrder.update({ where: { id }, data: { status: next } });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'SalesOrder',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: next },
    });
    return updated;
  }

  /**
   * P1 remediation (WF-001): COMPLETED requires the order to already be
   * DISPATCHED (per the transition map — the only legal predecessor) *and*
   * every line item to be fully delivered, checked again here explicitly as
   * a defense-in-depth business condition rather than relying solely on the
   * transition map (DispatchService only ever sets DISPATCHED once delivery
   * is already complete, so this should never actually fire — it exists so a
   * future change to that invariant fails loudly here instead of silently
   * completing an under-delivered order).
   */
  async complete(id: string) {
    const existing = await this.getById(id);
    assertValidTransition('Sales Order', existing.status, 'COMPLETED', SALES_ORDER_MANUAL_TRANSITIONS);

    const underDelivered = existing.items.some((item) => Number(item.deliveredQty) < Number(item.quantity));
    if (underDelivered) {
      throw new BadRequestException('Cannot complete a Sales Order with items that are not fully delivered yet.');
    }

    const updated = await this.prisma.db.salesOrder.update({ where: { id }, data: { status: 'COMPLETED' } });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'SalesOrder',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: 'COMPLETED' },
    });
    return updated;
  }

  /**
   * P1 remediation (WF-001/WF-003): CANCELLED is reachable from every
   * pre-dispatch/pre-completion state but not from DISPATCHED or COMPLETED
   * (physical goods have already moved, or the order is already closed) —
   * enforced structurally by `SALES_ORDER_MANUAL_TRANSITIONS` having no
   * CANCELLED entry for those two states. CANCELLED itself is terminal: no
   * "revive a cancelled order" path exists (closes WF-003 as a side effect).
   */
  async cancel(id: string, reason?: string) {
    const existing = await this.getById(id);
    assertValidTransition('Sales Order', existing.status, 'CANCELLED', SALES_ORDER_MANUAL_TRANSITIONS);

    const updated = await this.prisma.db.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'SalesOrder',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: 'CANCELLED', reason },
    });
    return updated;
  }
}
