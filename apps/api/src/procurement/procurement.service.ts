import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService, ScopedTx } from '../inventory/inventory.service';
import { IdempotencyService } from '../common/idempotency.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { assertValidTransition } from '../common/workflow.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import {
  CreatePurchaseRequestDto,
  PurchaseRequestStatus,
  UpdatePurchaseRequestStatusDto,
} from './dto/purchase-request.dto';
import { CreatePurchaseOrderDto, PurchaseOrderStatus, UpdatePurchaseOrderStatusDto } from './dto/purchase-order.dto';
import { CreateGoodsReceiptDto } from './dto/goods-receipt.dto';

/**
 * P1 remediation (WF-004): a Purchase Request may only be submitted for
 * approval, then approved or rejected — CONVERTED is system-only, set by
 * `createOrder()` once a real Purchase Order exists against an APPROVED
 * request (closes the "DRAFT -> CONVERTED, skipping Approval entirely" gap
 * named in the finding).
 */
const PURCHASE_REQUEST_TRANSITIONS: Partial<Record<PurchaseRequestStatus, readonly PurchaseRequestStatus[]>> = {
  DRAFT: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
};

/**
 * P1 remediation (WF-004): PARTIALLY_RECEIVED and RECEIVED are absent from
 * every list — they are set only by `createGoodsReceipt()`/`acceptGoodsReceipt()`,
 * never by this manual transition.
 */
const PURCHASE_ORDER_TRANSITIONS: Partial<Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['SENT', 'CANCELLED'],
  SENT: ['CANCELLED'],
};

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly inventoryService: InventoryService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  // ---------------------------------------------------------------- Purchase Requests

  async createRequest(dto: CreatePurchaseRequestDto, requestedBy: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Purchase requests can only be created within a tenant context');
    assertFactoryAccess(ctx, dto.factoryId);

    const factory = await this.prisma.db.factory.findUnique({ where: { id: dto.factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');

    const requestNumber = `PR-${String((await this.prisma.db.purchaseRequest.count()) + 1).padStart(6, '0')}`;
    const request = await this.prisma.db.purchaseRequest.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: dto.factoryId,
        requestNumber,
        requestedBy,
        items: { create: dto.items },
      },
      include: { items: { include: { material: { select: { id: true, name: true, code: true } } } } },
    });
    await this.auditService.log({
      action: 'CREATE',
      entityType: 'PurchaseRequest',
      entityId: request.id,
      newValue: { requestNumber },
    });
    return request;
  }

  async listRequests(query: PaginationQueryDto & { factoryId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = factoryScopeFilter(ctx, query.factoryId);
    const [items, total] = await Promise.all([
      this.prisma.db.purchaseRequest.findMany({
        where,
        include: { items: true },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.purchaseRequest.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getRequestById(id: string) {
    const request = await this.prisma.db.purchaseRequest.findUnique({
      where: { id },
      include: { items: { include: { material: true } } },
    });
    if (!request) throw new NotFoundException('Purchase request not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), request.factoryId);
    return request;
  }

  /**
   * P1 remediation (WF-004): thin dispatcher preserving the existing PATCH
   * contract; CONVERTED is rejected here with a clear error rather than
   * silently accepted, since it is system-only (set by `createOrder`).
   */
  async updateRequestStatus(id: string, dto: UpdatePurchaseRequestStatusDto, actorUserId: string) {
    if (dto.status === 'CONVERTED') {
      throw new BadRequestException(
        'CONVERTED is set automatically when a Purchase Order is created against this request, and cannot be set manually.',
      );
    }
    if (dto.status === 'APPROVED' || dto.status === 'REJECTED') {
      return this.decideRequest(id, dto.status, actorUserId);
    }
    return this.submitRequest(id, dto.status);
  }

  private async submitRequest(id: string, next: PurchaseRequestStatus) {
    const existing = await this.getRequestById(id);
    assertValidTransition('Purchase Request', existing.status, next, PURCHASE_REQUEST_TRANSITIONS);
    const updated = await this.prisma.db.purchaseRequest.update({ where: { id }, data: { status: next } });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'PurchaseRequest',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: next },
    });
    return updated;
  }

  /**
   * P1 remediation (WF-005): segregation of duties — the user who requested
   * the purchase may not also be the one who approves or rejects it, even if
   * their role grants both CREATE and APPROVE on `purchase_order`. Without
   * this, a single user could originate and approve their own purchase,
   * defeating the point of a distinct approval stage (SRS §6.2).
   */
  private async decideRequest(id: string, next: 'APPROVED' | 'REJECTED', actorUserId: string) {
    const existing = await this.getRequestById(id);
    assertValidTransition('Purchase Request', existing.status, next, PURCHASE_REQUEST_TRANSITIONS);

    if (existing.requestedBy === actorUserId) {
      throw new ForbiddenException(
        'You cannot approve or reject a Purchase Request you created yourself — a different authorized user must decide it.',
      );
    }

    const updated = await this.prisma.db.purchaseRequest.update({ where: { id }, data: { status: next } });
    await this.auditService.log({
      action: next === 'APPROVED' ? 'APPROVE' : 'REJECT',
      entityType: 'PurchaseRequest',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: next },
    });
    return updated;
  }

  // ---------------------------------------------------------------- Purchase Orders

  /** P1 remediation (API-005): a repeated call with the same `idempotencyKey` returns the original order. */
  async createOrder(dto: CreatePurchaseOrderDto, createdBy: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Purchase orders can only be created within a tenant context');

    const existingId = await this.idempotencyService.check('purchase_order:create', dto.idempotencyKey);
    if (existingId) return this.getOrderById(existingId);

    assertFactoryAccess(ctx, dto.factoryId);
    const supplier = await this.prisma.db.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const factory = await this.prisma.db.factory.findUnique({ where: { id: dto.factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');

    // P1 remediation (WF-004): a Purchase Order created against a Purchase Request must
    // reference one that has actually cleared the Approval stage (SRS §6.2) — closes the
    // remaining path by which a PR could reach a PO without ever being approved.
    if (dto.purchaseRequestId) {
      const request = await this.getRequestById(dto.purchaseRequestId);
      if (request.status !== 'APPROVED') {
        throw new BadRequestException(
          `Purchase Request ${request.requestNumber} must be APPROVED before a Purchase Order can be created against it (current status: ${request.status}).`,
        );
      }
    }

    const subtotal = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const orderNumber = `PO-${String((await this.prisma.db.purchaseOrder.count()) + 1).padStart(6, '0')}`;

    const order = await this.prisma.db.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: dto.factoryId,
        supplierId: dto.supplierId,
        purchaseRequestId: dto.purchaseRequestId,
        poNumber: orderNumber,
        createdBy,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        subtotal,
        total: subtotal,
        items: {
          create: dto.items.map((i) => ({
            materialId: i.materialId,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            lineTotal: i.quantity * i.unitPrice,
          })),
        },
      },
      include: { items: { include: { material: { select: { id: true, name: true, code: true } } } }, supplier: true },
    });

    if (dto.purchaseRequestId) {
      await this.prisma.db.purchaseRequest.update({
        where: { id: dto.purchaseRequestId },
        data: { status: 'CONVERTED' },
      });
    }

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'PurchaseOrder',
      entityId: order.id,
      newValue: { poNumber: orderNumber },
    });
    await this.idempotencyService.record('purchase_order:create', dto.idempotencyKey, order.id);
    return order;
  }

  async listOrders(query: PaginationQueryDto & { status?: string; factoryId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = {
      ...(query.status ? { status: query.status as never } : {}),
      ...factoryScopeFilter(ctx, query.factoryId),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.purchaseOrder.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } }, items: true },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.purchaseOrder.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getOrderById(id: string) {
    const order = await this.prisma.db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        factory: { select: { id: true, name: true, code: true } },
        items: { include: { material: true } },
        goodsReceipts: true,
      },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), order.factoryId);
    return order;
  }

  /**
   * P1 remediation (WF-004/WF-005): thin dispatcher preserving the existing
   * PATCH contract. RECEIVED/PARTIALLY_RECEIVED are rejected here — they are
   * system-only, set by `createGoodsReceipt`/`acceptGoodsReceipt`.
   * Approving requires segregation of duties, same as Purchase Requests.
   */
  async updateOrderStatus(id: string, dto: UpdatePurchaseOrderStatusDto, actorUserId: string) {
    if (dto.status === 'RECEIVED' || dto.status === 'PARTIALLY_RECEIVED') {
      throw new BadRequestException(
        `${dto.status} is set automatically from Goods Receipt processing, and cannot be set manually.`,
      );
    }

    const existing = await this.getOrderById(id);
    assertValidTransition('Purchase Order', existing.status, dto.status, PURCHASE_ORDER_TRANSITIONS);

    if (dto.status === 'APPROVED' && existing.createdBy && existing.createdBy === actorUserId) {
      throw new ForbiddenException(
        'You cannot approve a Purchase Order you created yourself — a different authorized user must approve it.',
      );
    }

    const updated = await this.prisma.db.purchaseOrder.update({ where: { id }, data: { status: dto.status } });
    await this.auditService.log({
      action: dto.status === 'APPROVED' ? 'APPROVE' : 'UPDATE',
      entityType: 'PurchaseOrder',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
    });
    return updated;
  }

  // ---------------------------------------------------------------- Goods Receipts

  /**
   * Records what physically arrived and rolls the PO's received/rejected
   * quantities and status forward — SRS §6.2/§8.3.
   *
   * P1 remediation (WF-006): per SRS §6.2's explicit ordering ("Goods Receipt
   * -> Quality Check -> Inventory"), creating a receipt NO LONGER posts stock.
   * The receipt is created in PENDING_QC status; a separate, explicit
   * `acceptGoodsReceipt()` call — the real "Quality Check" gate — is what
   * posts accepted quantities into stock. This is a deliberate behavior
   * change from the previous version, documented here: physical receiving
   * (this method) and inventory acceptance (`acceptGoodsReceipt`) are now two
   * distinct steps, matching the SRS instead of collapsing them into one.
   *
   * P0 remediation (API-001, still in effect): the receipt document and every
   * purchase-order item's received/rejected quantity rollup still commit
   * together in one transaction.
   */
  async createGoodsReceipt(dto: CreateGoodsReceiptDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Goods receipts can only be created within a tenant context');

    // P1 remediation (API-005): a repeated call with the same `idempotencyKey` returns the original receipt.
    const existingId = await this.idempotencyService.check('goods_receipt:create', dto.idempotencyKey);
    if (existingId) return this.getGoodsReceiptById(existingId);

    const purchaseOrder = await this.getOrderById(dto.purchaseOrderId);
    const warehouse = await this.prisma.db.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const poItemIds = new Map(purchaseOrder.items.map((i) => [i.id, i]));
    for (const item of dto.items) {
      const poItem = poItemIds.get(item.purchaseOrderItemId);
      if (!poItem) {
        throw new NotFoundException(`Purchase order item ${item.purchaseOrderItemId} does not belong to this order`);
      }
      // P2-adjacent hygiene fix bundled with this change (WF-010): accepted + rejected
      // must reconcile with what was actually received, not silently inflate both.
      if (item.acceptedQty + (item.rejectedQty ?? 0) > item.receivedQty) {
        throw new BadRequestException(
          `Item ${item.purchaseOrderItemId}: acceptedQty + rejectedQty cannot exceed receivedQty`,
        );
      }
    }

    const receipt = await this.prisma.db.$transaction(async (tx) => {
      const receiptNumber = `GR-${String((await tx.goodsReceipt.count()) + 1).padStart(6, '0')}`;

      const created = await tx.goodsReceipt.create({
        data: {
          tenantId: ctx.tenantId as string,
          factoryId: purchaseOrder.factoryId,
          purchaseOrderId: dto.purchaseOrderId,
          warehouseId: dto.warehouseId,
          receiptNumber,
          status: 'PENDING_QC',
          items: {
            create: dto.items.map((i) => ({
              purchaseOrderItemId: i.purchaseOrderItemId,
              receivedQty: i.receivedQty,
              acceptedQty: i.acceptedQty,
              rejectedQty: i.rejectedQty ?? 0,
              notes: i.notes,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of dto.items) {
        await tx.purchaseOrderItem.update({
          where: { id: item.purchaseOrderItemId },
          data: {
            receivedQty: { increment: item.receivedQty },
            rejectedQty: { increment: item.rejectedQty ?? 0 },
          },
        });
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: dto.purchaseOrderId } });
      const fullyReceived = updatedItems.every((i) => Number(i.receivedQty) >= Number(i.quantity));
      const partiallyReceived = updatedItems.some((i) => Number(i.receivedQty) > 0);
      await tx.purchaseOrder.update({
        where: { id: dto.purchaseOrderId },
        data: { status: fullyReceived ? 'RECEIVED' : partiallyReceived ? 'PARTIALLY_RECEIVED' : undefined },
      });

      return created;
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'GoodsReceipt',
      entityId: receipt.id,
      newValue: { receiptNumber: receipt.receiptNumber, status: 'PENDING_QC' },
    });
    await this.idempotencyService.record('goods_receipt:create', dto.idempotencyKey, receipt.id);
    return receipt;
  }

  /**
   * P1 remediation (WF-006/WF-011): the "Quality Check" gate SRS §6.2 requires
   * between receiving and inventory. Only a `PENDING_QC` receipt can be
   * accepted (calling this twice on the same receipt is rejected, not a
   * silent no-op or a double stock-post — closes a duplicate-processing risk
   * along the way). Posts a RECEIVE stock movement for every item with
   * `acceptedQty > 0`, inside the same transaction as the receipt's own
   * status update, and resolves the receipt's final status from the real
   * accepted/rejected split (REJECTED is now a reachable status, not a dead
   * enum value — closes WF-011).
   */
  async acceptGoodsReceipt(id: string, userId: string) {
    const receipt = await this.getGoodsReceiptById(id);
    if (receipt.status !== 'PENDING_QC') {
      throw new BadRequestException(
        `Goods Receipt ${receipt.receiptNumber} has already been processed (status: ${receipt.status}) and cannot be accepted again.`,
      );
    }

    const totalAccepted = receipt.items.reduce((sum, i) => sum + Number(i.acceptedQty), 0);
    const totalRejected = receipt.items.reduce((sum, i) => sum + Number(i.rejectedQty), 0);
    const finalStatus =
      totalAccepted === 0 && totalRejected > 0 ? 'REJECTED' : totalRejected > 0 ? 'PARTIALLY_ACCEPTED' : 'ACCEPTED';

    const updated = await this.prisma.db.$transaction(async (tx) => {
      for (const item of receipt.items) {
        if (Number(item.acceptedQty) > 0) {
          await this.inventoryService.recordMovement(
            userId,
            {
              warehouseId: receipt.warehouseId,
              materialId: item.purchaseOrderItem.materialId ?? undefined,
              type: 'RECEIVE',
              quantity: Number(item.acceptedQty),
              unit: item.purchaseOrderItem.unit,
              referenceType: 'GoodsReceipt',
              referenceId: receipt.id,
            },
            tx as ScopedTx,
          );
        }
      }

      return tx.goodsReceipt.update({ where: { id }, data: { status: finalStatus } });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'GoodsReceipt',
      entityId: id,
      oldValue: { status: 'PENDING_QC' },
      newValue: { status: finalStatus },
    });
    return updated;
  }

  async listGoodsReceipts(query: PaginationQueryDto & { factoryId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = factoryScopeFilter(ctx, query.factoryId);
    const [items, total] = await Promise.all([
      this.prisma.db.goodsReceipt.findMany({
        where,
        include: {
          purchaseOrder: { select: { id: true, poNumber: true } },
          warehouse: { select: { id: true, name: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.goodsReceipt.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getGoodsReceiptById(id: string) {
    const receipt = await this.prisma.db.goodsReceipt.findUnique({
      where: { id },
      include: {
        purchaseOrder: { select: { id: true, poNumber: true } },
        warehouse: { select: { id: true, name: true } },
        items: { include: { purchaseOrderItem: { include: { material: true } } } },
      },
    });
    if (!receipt) throw new NotFoundException('Goods receipt not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), receipt.factoryId);
    return receipt;
  }
}
