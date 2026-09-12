import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateProcessRouteDto } from './dto/process-route.dto';
import { CreateProductionOrderDto, UpdateProductionOrderStatusDto } from './dto/production-order.dto';
import { CreateProductionBatchDto, RecordBatchOutputDto, UpdateBatchStatusDto } from './dto/production-batch.dto';
import { RecordMaterialConsumptionDto } from './dto/material-consumption.dto';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly inventoryService: InventoryService,
  ) {}

  private tenantId(): string {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('This action can only be performed within a tenant context');
    return ctx.tenantId;
  }

  // ---------------------------------------------------------------- Process Routes

  async createProcessRoute(dto: CreateProcessRouteDto) {
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.processRoute.findFirst({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`A process route with code "${dto.code}" already exists`);

    return this.prisma.db.processRoute.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        stages: { create: dto.stages },
      },
      include: { stages: { orderBy: { sequence: 'asc' } } },
    });
  }

  async listProcessRoutes() {
    return this.prisma.db.processRoute.findMany({
      include: { stages: { orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  // ---------------------------------------------------------------- Production Orders

  async createOrder(dto: CreateProductionOrderDto) {
    const tenantId = this.tenantId();
    const factory = await this.prisma.db.factory.findUnique({ where: { id: dto.factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');
    const product = await this.prisma.db.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const orderNumber = `PRO-${String((await this.prisma.db.productionOrder.count()) + 1).padStart(6, '0')}`;

    const order = await this.prisma.db.productionOrder.create({
      data: {
        tenantId,
        factoryId: dto.factoryId,
        orderNumber,
        salesOrderId: dto.salesOrderId,
        productId: dto.productId,
        quantity: dto.quantity,
        unit: dto.unit,
        departmentId: dto.departmentId,
        processRouteId: dto.processRouteId,
        priority: dto.priority,
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : undefined,
        assignedMachineId: dto.assignedMachineId,
        assignedSupervisorId: dto.assignedSupervisorId,
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'ProductionOrder',
      entityId: order.id,
      newValue: { orderNumber },
    });
    return order;
  }

  async listOrders(query: PaginationQueryDto & { factoryId?: string; status?: string }) {
    const where = {
      ...(query.factoryId ? { factoryId: query.factoryId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.productionOrder.findMany({
        where,
        include: { product: { select: { id: true, name: true, sku: true } } },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.productionOrder.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getOrderById(id: string) {
    const order = await this.prisma.db.productionOrder.findUnique({
      where: { id },
      include: {
        product: true,
        factory: { select: { id: true, name: true, code: true } },
        department: true,
        processRoute: { include: { stages: { orderBy: { sequence: 'asc' } } } },
        assignedMachine: { select: { id: true, name: true, machineCode: true } },
        batches: true,
        materialConsumptions: { include: { material: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Production order not found');
    return order;
  }

  async updateOrderStatus(id: string, dto: UpdateProductionOrderStatusDto) {
    const existing = await this.getOrderById(id);
    const data: { status: typeof dto.status; actualStartDate?: Date; actualEndDate?: Date } = { status: dto.status };
    if (dto.status === 'IN_PROGRESS' && !existing.actualStartDate) data.actualStartDate = new Date();
    if (dto.status === 'COMPLETED') data.actualEndDate = new Date();

    const updated = await this.prisma.db.productionOrder.update({ where: { id }, data });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'ProductionOrder',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
    });
    return updated;
  }

  // ---------------------------------------------------------------- Production Batches

  async createBatch(dto: CreateProductionBatchDto) {
    const tenantId = this.tenantId();
    const order = await this.getOrderById(dto.productionOrderId);

    const batchNumber = `BATCH-${String((await this.prisma.db.productionBatch.count()) + 1).padStart(6, '0')}`;
    const batch = await this.prisma.db.productionBatch.create({
      data: {
        tenantId,
        factoryId: order.factoryId,
        batchNumber,
        productionOrderId: dto.productionOrderId,
        productId: order.productId,
        processStageId: dto.processStageId,
        machineId: dto.machineId,
        operatorId: dto.operatorId,
        shiftId: dto.shiftId,
        inputQuantity: dto.inputQuantity,
        startTime: dto.startTime ? new Date(dto.startTime) : new Date(),
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'ProductionBatch',
      entityId: batch.id,
      newValue: { batchNumber },
    });
    return batch;
  }

  async listBatches(query: PaginationQueryDto & { productionOrderId?: string }) {
    const where = query.productionOrderId ? { productionOrderId: query.productionOrderId } : {};
    const [items, total] = await Promise.all([
      this.prisma.db.productionBatch.findMany({
        where,
        include: {
          machine: { select: { id: true, name: true } },
          operator: { select: { id: true, firstName: true, lastName: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.productionBatch.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getBatchById(id: string) {
    const batch = await this.prisma.db.productionBatch.findUnique({
      where: { id },
      include: {
        productionOrder: { select: { id: true, orderNumber: true, factoryId: true } },
        machine: true,
        operator: true,
        shift: true,
        product: { select: { id: true, name: true, sku: true, unit: true } },
      },
    });
    if (!batch) throw new NotFoundException('Production batch not found');
    return batch;
  }

  /** Records output/wastage/rework/rejection (SRS §7.1/§7.4) and, if a warehouse is given, receives the good output into stock. */
  async recordBatchOutput(id: string, dto: RecordBatchOutputDto, userId: string) {
    const batch = await this.getBatchById(id);

    const updated = await this.prisma.db.productionBatch.update({
      where: { id },
      data: {
        outputQuantity: dto.outputQuantity,
        wastage: dto.wastage ?? 0,
        rework: dto.rework ?? 0,
        rejection: dto.rejection ?? 0,
        endTime: dto.endTime ? new Date(dto.endTime) : new Date(),
        status: 'COMPLETED',
      },
    });

    if (dto.outputWarehouseId && dto.outputQuantity > 0) {
      await this.inventoryService.recordMovement(userId, {
        warehouseId: dto.outputWarehouseId,
        productId: batch.productId,
        batchNumber: batch.batchNumber,
        type: 'PRODUCTION_RECEIPT',
        quantity: dto.outputQuantity,
        unit: batch.product.unit,
        referenceType: 'ProductionBatch',
        referenceId: id,
      });
    }

    await this.auditService.log({ action: 'UPDATE', entityType: 'ProductionBatch', entityId: id, newValue: dto });
    return updated;
  }

  async updateBatchStatus(id: string, dto: UpdateBatchStatusDto) {
    await this.getBatchById(id);
    return this.prisma.db.productionBatch.update({ where: { id }, data: { status: dto.status } });
  }

  // ---------------------------------------------------------------- Material Consumption

  /** Consumes material against a production order/batch and issues it from stock (SRS §7.1, §8.3). */
  async recordConsumption(dto: RecordMaterialConsumptionDto, userId: string) {
    await this.getOrderById(dto.productionOrderId);
    const material = await this.prisma.db.material.findUnique({ where: { id: dto.materialId } });
    if (!material) throw new NotFoundException('Material not found');

    const consumption = await this.prisma.db.materialConsumption.create({
      data: {
        productionOrderId: dto.productionOrderId,
        productionBatchId: dto.productionBatchId,
        materialId: dto.materialId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        unit: dto.unit,
      },
    });

    await this.inventoryService.recordMovement(userId, {
      warehouseId: dto.warehouseId,
      materialId: dto.materialId,
      type: 'CONSUMPTION',
      quantity: -Math.abs(dto.quantity),
      unit: dto.unit,
      referenceType: 'ProductionOrder',
      referenceId: dto.productionOrderId,
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'MaterialConsumption',
      entityId: consumption.id,
      newValue: dto,
    });
    return consumption;
  }
}
