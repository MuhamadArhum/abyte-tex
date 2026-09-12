import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateDispatchDto } from './dto/create-dispatch.dto';

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly inventoryService: InventoryService,
  ) {}

  /** Issues stock for each item and rolls the sales order toward DISPATCHED (SRS §6.1, §8.3, §8.4). */
  async create(dto: CreateDispatchDto, userId: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Dispatches can only be created within a tenant context');

    const salesOrder = await this.prisma.db.salesOrder.findUnique({
      where: { id: dto.salesOrderId },
      include: { items: true },
    });
    if (!salesOrder) throw new NotFoundException('Sales order not found');
    const warehouse = await this.prisma.db.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const dispatchNumber = `DSP-${String((await this.prisma.db.dispatch.count()) + 1).padStart(6, '0')}`;

    const dispatch = await this.prisma.db.dispatch.create({
      data: {
        tenantId: ctx.tenantId,
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
      await this.inventoryService.recordMovement(userId, {
        warehouseId: dto.warehouseId,
        productId: item.productId,
        batchNumber: item.batchNumber,
        type: 'ISSUE',
        quantity: -Math.abs(item.quantity),
        unit: item.unit,
        referenceType: 'Dispatch',
        referenceId: dispatch.id,
      });

      if (item.salesOrderItemId) {
        await this.prisma.db.salesOrderItem.update({
          where: { id: item.salesOrderItemId },
          data: { deliveredQty: { increment: item.quantity } },
        });
      }
    }

    const updatedItems = await this.prisma.db.salesOrderItem.findMany({ where: { salesOrderId: dto.salesOrderId } });
    const fullyDelivered = updatedItems.every((i) => Number(i.deliveredQty) >= Number(i.quantity));
    await this.prisma.db.salesOrder.update({
      where: { id: dto.salesOrderId },
      data: { status: fullyDelivered ? 'DISPATCHED' : 'READY' },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'Dispatch',
      entityId: dispatch.id,
      newValue: { dispatchNumber },
    });
    return dispatch;
  }

  async list(query: PaginationQueryDto & { salesOrderId?: string }) {
    const where = query.salesOrderId ? { salesOrderId: query.salesOrderId } : {};
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
    return dispatch;
  }
}
