import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService, ScopedTx } from '../inventory/inventory.service';
import { QualityService } from '../quality/quality.service';
import { IdempotencyService } from '../common/idempotency.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateDispatchDto } from './dto/create-dispatch.dto';

/**
 * P1 remediation (WF-012): a Dispatch may only be created against a Sales
 * Order that is READY — passed quality, cleared to ship. A partially
 * delivered order stays READY (see `create()`'s own status roll-forward
 * below), so a second dispatch completing the remainder is still eligible.
 * DISPATCHED is deliberately excluded: it only means "fully delivered
 * already," at which point there is nothing legitimate left to ship — any
 * further attempt is an over-delivery, independently blocked per-item by the
 * WF-014 quantity cap below regardless of this precondition. Every earlier
 * state (DRAFT, CONFIRMED, PRODUCTION_PLANNED, IN_PRODUCTION, QUALITY) means
 * goods have not been cleared to ship yet.
 */
const DISPATCH_ELIGIBLE_SALES_ORDER_STATUSES = new Set(['READY']);

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly inventoryService: InventoryService,
    private readonly qualityService: QualityService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Issues stock for each item and rolls the sales order toward DISPATCHED
   * (SRS §6.1, §8.3, §8.4).
   *
   * P0 remediation (WF-015): before touching any stock, every item that names
   * a batch is checked against that batch's current status — a batch on HOLD
   * (set by `QualityService.createInspection` on a REJECT or HOLD outcome, and
   * no longer silently clearable by `recordBatchOutput` per the companion
   * WF-008/API-003 fix) blocks the *entire* dispatch, not just that one item,
   * so a rejected/held batch can never leave the building through this
   * endpoint. Releasing a HOLD (e.g. after rework) uses the same
   * `PATCH /production-batches/:id/status` action that already existed.
   *
   * P0 remediation (API-002): the dispatch record, every item's stock ISSUE,
   * the sales-order-item delivered-quantity rollup, and the sales order's own
   * status transition now all happen inside one transaction — a mid-loop
   * failure rolls back everything instead of leaving stock decremented with
   * no matching dispatch state, or vice versa.
   */
  async create(dto: CreateDispatchDto, userId: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Dispatches can only be created within a tenant context');

    // P1 remediation (API-005): a repeated call with the same `idempotencyKey` returns the original dispatch.
    const existingId = await this.idempotencyService.check('dispatch:create', dto.idempotencyKey);
    if (existingId) return this.getById(existingId);

    assertFactoryAccess(ctx, dto.factoryId);

    const salesOrder = await this.prisma.db.salesOrder.findUnique({
      where: { id: dto.salesOrderId },
      include: { items: true },
    });
    if (!salesOrder) throw new NotFoundException('Sales order not found');
    const warehouse = await this.prisma.db.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    // P1 remediation (WF-012): reject before touching any stock if the order hasn't been
    // cleared to ship yet.
    if (!DISPATCH_ELIGIBLE_SALES_ORDER_STATUSES.has(salesOrder.status)) {
      throw new BadRequestException(
        `Sales Order ${salesOrder.orderNumber} is ${salesOrder.status} and is not eligible for dispatch (must be READY).`,
      );
    }

    // P1 remediation (WF-014): every item's requested quantity must fit within its Sales
    // Order line's remaining undelivered balance — computed against already-recorded
    // deliveries, not just the ordered quantity, so a second partial dispatch can't
    // overshoot what the first one left remaining.
    for (const item of dto.items) {
      if (!item.salesOrderItemId) continue;
      const soItem = salesOrder.items.find((i) => i.id === item.salesOrderItemId);
      if (!soItem) continue;
      const remaining = Number(soItem.quantity) - Number(soItem.deliveredQty);
      if (item.quantity > remaining) {
        throw new BadRequestException(
          `Cannot dispatch ${item.quantity} of item ${item.salesOrderItemId} — only ${remaining} remains undelivered on this Sales Order line.`,
        );
      }
    }

    // P1 remediation (Step 7): quality-blocking is now a single domain rule shared with
    // any future caller, not duplicated inline here — see QualityService.assertBatchShippable.
    for (const item of dto.items) {
      if (!item.batchNumber) continue;
      await this.qualityService.assertBatchShippable(item.batchNumber);
    }

    const dispatch = await this.prisma.db.$transaction(async (tx) => {
      const dispatchNumber = `DSP-${String((await tx.dispatch.count()) + 1).padStart(6, '0')}`;

      const created = await tx.dispatch.create({
        data: {
          tenantId: ctx.tenantId as string,
          factoryId: dto.factoryId,
          salesOrderId: dto.salesOrderId,
          warehouseId: dto.warehouseId,
          dispatchNumber,
          status: 'DISPATCHED',
          vehicleNumber: dto.vehicleNumber,
          driverName: dto.driverName,
          driverPhone: dto.driverPhone,
          deliveryAddress: dto.deliveryAddress,
          dispatchDate: new Date(),
          items: {
            create: dto.items.map((i) => ({
              productId: i.productId,
              salesOrderItemId: i.salesOrderItemId,
              quantity: i.quantity,
              unit: i.unit,
              batchNumber: i.batchNumber,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of dto.items) {
        await this.inventoryService.recordMovement(
          userId,
          {
            warehouseId: dto.warehouseId,
            productId: item.productId,
            batchNumber: item.batchNumber,
            type: 'ISSUE',
            quantity: -Math.abs(item.quantity),
            unit: item.unit,
            referenceType: 'Dispatch',
            referenceId: created.id,
          },
          tx as ScopedTx,
        );

        if (item.salesOrderItemId) {
          await tx.salesOrderItem.update({
            where: { id: item.salesOrderItemId },
            data: { deliveredQty: { increment: item.quantity } },
          });
        }
      }

      const updatedItems = await tx.salesOrderItem.findMany({ where: { salesOrderId: dto.salesOrderId } });
      const fullyDelivered = updatedItems.every((i) => Number(i.deliveredQty) >= Number(i.quantity));
      await tx.salesOrder.update({
        where: { id: dto.salesOrderId },
        data: { status: fullyDelivered ? 'DISPATCHED' : 'READY' },
      });

      return created;
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'Dispatch',
      entityId: dispatch.id,
      newValue: { dispatchNumber: dispatch.dispatchNumber },
    });
    await this.idempotencyService.record('dispatch:create', dto.idempotencyKey, dispatch.id);
    return dispatch;
  }

  async list(query: PaginationQueryDto & { salesOrderId?: string; factoryId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = {
      ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
      ...factoryScopeFilter(ctx, query.factoryId),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.dispatch.findMany({
        where,
        include: { salesOrder: { select: { id: true, orderNumber: true } }, items: true },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.dispatch.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const dispatch = await this.prisma.db.dispatch.findUnique({
      where: { id },
      include: {
        salesOrder: { include: { customer: { select: { id: true, name: true } } } },
        warehouse: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), dispatch.factoryId);
    return dispatch;
  }
}
