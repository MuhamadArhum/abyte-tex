import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreatePurchaseRequestDto, UpdatePurchaseRequestStatusDto } from './dto/purchase-request.dto';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderStatusDto } from './dto/purchase-order.dto';
import { CreateGoodsReceiptDto } from './dto/goods-receipt.dto';

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ---------------------------------------------------------------- Purchase Requests

  async createRequest(dto: CreatePurchaseRequestDto, requestedBy: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Purchase requests can only be created within a tenant context');

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

  async listRequests(query: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.db.purchaseRequest.findMany({
        include: { items: true },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.purchaseRequest.count(),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getRequestById(id: string) {
    const request = await this.prisma.db.purchaseRequest.findUnique({
      where: { id },
      include: { items: { include: { material: true } } },
    });
    if (!request) throw new NotFoundException('Purchase request not found');
    return request;
  }

  async updateRequestStatus(id: string, dto: UpdatePurchaseRequestStatusDto) {
    const existing = await this.getRequestById(id);
    const updated = await this.prisma.db.purchaseRequest.update({ where: { id }, data: { status: dto.status } });
    await this.auditService.log({
      action: dto.status === 'APPROVED' ? 'APPROVE' : dto.status === 'REJECTED' ? 'REJECT' : 'UPDATE',
      entityType: 'PurchaseRequest',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
    });
    return updated;
  }

  // ---------------------------------------------------------------- Purchase Orders

  async createOrder(dto: CreatePurchaseOrderDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Purchase orders can only be created within a tenant context');

    const supplier = await this.prisma.db.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const factory = await this.prisma.db.factory.findUnique({ where: { id: dto.factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');

    const subtotal = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const orderNumber = `PO-${String((await this.prisma.db.purchaseOrder.count()) + 1).padStart(6, '0')}`;

    const order = await this.prisma.db.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: dto.factoryId,
        supplierId: dto.supplierId,
        purchaseRequestId: dto.purchaseRequestId,
        poNumber: orderNumber,
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
    return order;
  }

  async listOrders(query: PaginationQueryDto & { status?: string }) {
    const where = query.status ? { status: query.status as never } : {};
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
    return order;
  }

  async updateOrderStatus(id: string, dto: UpdatePurchaseOrderStatusDto) {
    const existing = await this.getOrderById(id);
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

  /** Records the receipt, moves accepted quantities into stock, and rolls the PO's status forward — SRS §6.2/§8.3. */
  async createGoodsReceipt(dto: CreateGoodsReceiptDto, userId: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Goods receipts can only be created within a tenant context');

    const purchaseOrder = await this.getOrderById(dto.purchaseOrderId);
    const warehouse = await this.prisma.db.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const poItemIds = new Set(purchaseOrder.items.map((i) => i.id));
    for (const item of dto.items) {
      if (!poItemIds.has(item.purchaseOrderItemId)) {
        throw new NotFoundException(`Purchase order item ${item.purchaseOrderItemId} does not belong to this order`);
      }
    }

    const receiptNumber = `GR-${String((await this.prisma.db.goodsReceipt.count()) + 1).padStart(6, '0')}`;
    const allAccepted = dto.items.every((i) => i.rejectedQty === undefined || i.rejectedQty === 0);

    const receipt = await this.prisma.db.goodsReceipt.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: purchaseOrder.factoryId,
        purchaseOrderId: dto.purchaseOrderId,
        warehouseId: dto.warehouseId,
        receiptNumber,
        status: allAccepted ? 'ACCEPTED' : 'PARTIALLY_ACCEPTED',
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
      const poItem = purchaseOrder.items.find((i) => i.id === item.purchaseOrderItemId)!;

      await this.prisma.db.purchaseOrderItem.update({
        where: { id: item.purchaseOrderItemId },
        data: {
          receivedQty: { increment: item.receivedQty },
          rejectedQty: { increment: item.rejectedQty ?? 0 },
        },
      });

      if (item.acceptedQty > 0) {
        await this.inventoryService.recordMovement(userId, {
          warehouseId: dto.warehouseId,
          materialId: poItem.materialId ?? undefined,
          type: 'RECEIVE',
          quantity: item.acceptedQty,
          unit: poItem.unit,
          referenceType: 'GoodsReceipt',
          referenceId: receipt.id,
        });
      }
    }

    const updatedItems = await this.prisma.db.purchaseOrderItem.findMany({
      where: { purchaseOrderId: dto.purchaseOrderId },
    });
    const fullyReceived = updatedItems.every((i) => Number(i.receivedQty) >= Number(i.quantity));
    const partiallyReceived = updatedItems.some((i) => Number(i.receivedQty) > 0);
    await this.prisma.db.purchaseOrder.update({
      where: { id: dto.purchaseOrderId },
      data: { status: fullyReceived ? 'RECEIVED' : partiallyReceived ? 'PARTIALLY_RECEIVED' : undefined },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'GoodsReceipt',
      entityId: receipt.id,
      newValue: { receiptNumber },
    });
    return receipt;
  }

  async listGoodsReceipts(query: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.db.goodsReceipt.findMany({
        include: {
          purchaseOrder: { select: { id: true, poNumber: true } },
          warehouse: { select: { id: true, name: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.goodsReceipt.count(),
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
    return receipt;
  }
}
