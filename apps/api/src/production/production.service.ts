import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService, ScopedTx } from '../inventory/inventory.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { assertValidTransition } from '../common/workflow.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateProcessRouteDto } from './dto/process-route.dto';
import {
  CreateProductionOrderDto,
  ProductionOrderStatus,
  UpdateProductionOrderStatusDto,
} from './dto/production-order.dto';
import { CreateProductionBatchDto, RecordBatchOutputDto, UpdateBatchStatusDto } from './dto/production-batch.dto';
import { RecordMaterialConsumptionDto } from './dto/material-consumption.dto';

/** P1 remediation (WF-007): explicit transition map per SRS §7.1/§7.3. */
const PRODUCTION_ORDER_TRANSITIONS: Partial<Record<ProductionOrderStatus, readonly ProductionOrderStatus[]>> = {
  PLANNED: ['RELEASED', 'CANCELLED'],
  RELEASED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
};

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
    assertFactoryAccess(TenantContextStore.getOrThrow(), dto.factoryId);
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

    // P1 remediation (WF-002): creating a linked Production Order now advances the Sales
    // Order to PRODUCTION_PLANNED, closing the gap where the two records had no
    // verified relationship at all. Best-effort: only advances if CONFIRMED is the
    // order's current status (the one legal predecessor) — a Sales Order in any other
    // state is left alone rather than blocking Production Order creation over it.
    if (dto.salesOrderId) {
      await this.prisma.db.salesOrder
        .updateMany({ where: { id: dto.salesOrderId, status: 'CONFIRMED' }, data: { status: 'PRODUCTION_PLANNED' } })
        .catch(() => undefined);
    }

    return order;
  }

  async listOrders(query: PaginationQueryDto & { factoryId?: string; status?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = {
      ...factoryScopeFilter(ctx, query.factoryId),
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
    assertFactoryAccess(TenantContextStore.getOrThrow(), order.factoryId);
    return order;
  }

  /**
   * P1 remediation (WF-007): transitions are validated against
   * `PRODUCTION_ORDER_TRANSITIONS` — PLANNED -> COMPLETED in one call
   * (skipping RELEASED/IN_PROGRESS entirely) is now rejected. COMPLETED
   * additionally requires real production evidence: at least one batch
   * exists and the batches' summed output is greater than zero — a 1000-unit
   * order can no longer be marked COMPLETED with zero batches produced.
   */
  async updateOrderStatus(id: string, dto: UpdateProductionOrderStatusDto) {
    const existing = await this.getOrderById(id);
    assertValidTransition('Production Order', existing.status, dto.status, PRODUCTION_ORDER_TRANSITIONS);

    if (dto.status === 'COMPLETED') {
      const totalOutput = existing.batches.reduce((sum, b) => sum + Number(b.outputQuantity), 0);
      if (existing.batches.length === 0 || totalOutput <= 0) {
        throw new BadRequestException(
          'Cannot complete a Production Order with no recorded batch output — at least one batch with output > 0 is required.',
        );
      }
    }

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

    // P1 remediation (WF-002): mirror the order's own progression onto its linked Sales
    // Order where the transition makes sense, best-effort (never blocks this operation).
    if (existing.salesOrderId) {
      const salesTarget =
        dto.status === 'IN_PROGRESS' ? 'IN_PRODUCTION' : dto.status === 'COMPLETED' ? 'QUALITY' : null;
      if (salesTarget) {
        await this.prisma.db.salesOrder
          .updateMany({
            where: {
              id: existing.salesOrderId,
              status: dto.status === 'IN_PROGRESS' ? 'PRODUCTION_PLANNED' : 'IN_PRODUCTION',
            },
            data: { status: salesTarget },
          })
          .catch(() => undefined);
      }
    }

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

  async listBatches(query: PaginationQueryDto & { productionOrderId?: string; factoryId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = {
      ...(query.productionOrderId ? { productionOrderId: query.productionOrderId } : {}),
      ...factoryScopeFilter(ctx, query.factoryId),
    };
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
    assertFactoryAccess(TenantContextStore.getOrThrow(), batch.factoryId);
    return batch;
  }

  /**
   * Records output/wastage/rework/rejection (SRS §7.1/§7.4) and, if a warehouse
   * is given, receives the good output into stock.
   *
   * P0 remediation (WF-015/WF-008): a batch already on HOLD (set by
   * `QualityService.createInspection` on a REJECT or HOLD outcome) is no
   * longer unconditionally flipped back to COMPLETED here — that silent
   * clearing was the exact mechanism that made a Reject/Hold outcome
   * non-durable and let a rejected batch's output reach dispatchable stock.
   * Recording output against a held batch still updates the quantity fields
   * (the physical count is still real and worth capturing), it just does not
   * clear the hold; release happens explicitly via the existing
   * `PATCH /production-batches/:id/status` action.
   *
   * P0 remediation (API-003): the batch update and its conditional stock
   * receipt now share one transaction — a failure in the stock receipt rolls
   * the batch status/quantity change back too, instead of leaving the batch
   * COMPLETED with output that was never actually received into any
   * warehouse.
   */
  async recordBatchOutput(id: string, dto: RecordBatchOutputDto, userId: string) {
    // P1 remediation (INV-004): a batch could previously be marked COMPLETED with real
    // output quantity while never entering stock, because `outputWarehouseId` was
    // optional. It is now effectively required whenever there is real output to receive.
    if (dto.outputQuantity > 0 && !dto.outputWarehouseId) {
      throw new BadRequestException(
        'outputWarehouseId is required when outputQuantity > 0 — output cannot be recorded without receiving it into a warehouse.',
      );
    }

    const batch = await this.getBatchById(id);

    // P1 remediation (WF-007 idempotency): a batch that is already COMPLETED cannot have
    // output recorded against it again — without this, calling this endpoint twice (a
    // double-click, a client retry) would post a second PRODUCTION_RECEIPT for the same
    // physical output. HOLD is deliberately still allowed through (recording output while
    // a hold is active is legitimate — see the P0 WF-015/WF-008 note below); IN_PROGRESS
    // is the normal first-call state.
    if (batch.status === 'COMPLETED') {
      throw new BadRequestException(
        `Batch ${batch.batchNumber} has already recorded output and is COMPLETED — output cannot be recorded twice.`,
      );
    }

    const nextStatus = batch.status === 'HOLD' ? 'HOLD' : 'COMPLETED';

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const updatedBatch = await tx.productionBatch.update({
        where: { id },
        data: {
          outputQuantity: dto.outputQuantity,
          wastage: dto.wastage ?? 0,
          rework: dto.rework ?? 0,
          rejection: dto.rejection ?? 0,
          endTime: dto.endTime ? new Date(dto.endTime) : new Date(),
          status: nextStatus,
        },
      });

      // P1 remediation (WF-007 idempotency, HOLD case): the COMPLETED guard above stops
      // re-recording once a batch is fully closed, but a HOLD batch stays re-callable by
      // design (quantities can be amended while a hold is active). Without this extra
      // check, calling this twice on the SAME held batch would post a second
      // PRODUCTION_RECEIPT for output already received once. Only the transition from
      // "no output recorded yet" (0) to "output recorded" posts to inventory; amending
      // the figures on a subsequent call does not re-post.
      const isFirstOutputRecording = Number(batch.outputQuantity) === 0;
      if (dto.outputWarehouseId && dto.outputQuantity > 0 && isFirstOutputRecording) {
        await this.inventoryService.recordMovement(
          userId,
          {
            warehouseId: dto.outputWarehouseId,
            productId: batch.productId,
            batchNumber: batch.batchNumber,
            type: 'PRODUCTION_RECEIPT',
            quantity: dto.outputQuantity,
            unit: batch.product.unit,
            referenceType: 'ProductionBatch',
            referenceId: id,
          },
          tx as ScopedTx,
        );
      }

      return updatedBatch;
    });

    await this.auditService.log({ action: 'UPDATE', entityType: 'ProductionBatch', entityId: id, newValue: dto });
    return updated;
  }

  /**
   * P1 remediation (WF-007/WF-009): this is the release-from-HOLD path (and
   * general manual status correction), not a substitute for `recordBatchOutput`
   * — completing a batch through here still requires real output evidence
   * (matches the same "no production evidence, no completion" rule applied
   * to the parent order), and the change is now audit-logged, which it
   * previously was not at all.
   */
  async updateBatchStatus(id: string, dto: UpdateBatchStatusDto) {
    const existing = await this.getBatchById(id);
    if (dto.status === 'COMPLETED' && Number(existing.outputQuantity) <= 0) {
      throw new BadRequestException(
        `Batch ${existing.batchNumber} cannot be marked COMPLETED with no recorded output — use "record output" first.`,
      );
    }
    const updated = await this.prisma.db.productionBatch.update({ where: { id }, data: { status: dto.status } });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'ProductionBatch',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
    });
    return updated;
  }

  // ---------------------------------------------------------------- Material Consumption

  /**
   * Consumes material against a production order/batch and issues it from
   * stock (SRS §7.1, §8.3).
   *
   * P0 remediation (API-004): the `MaterialConsumption` row and its matching
   * stock ISSUE now commit together — previously a failure in the stock
   * movement left a consumption record on file with no corresponding stock
   * deduction, inflating apparent on-hand material.
   */
  async recordConsumption(dto: RecordMaterialConsumptionDto, userId: string) {
    const order = await this.getOrderById(dto.productionOrderId);
    // P1 remediation (WF-007): material cannot be consumed against a Production Order
    // that has already been closed out — a completed or cancelled order has no
    // legitimate further use for materials issued against it.
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot record material consumption against a ${order.status} Production Order.`);
    }
    const material = await this.prisma.db.material.findUnique({ where: { id: dto.materialId } });
    if (!material) throw new NotFoundException('Material not found');

    const consumption = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.materialConsumption.create({
        data: {
          productionOrderId: dto.productionOrderId,
          productionBatchId: dto.productionBatchId,
          materialId: dto.materialId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          unit: dto.unit,
        },
      });

      await this.inventoryService.recordMovement(
        userId,
        {
          warehouseId: dto.warehouseId,
          materialId: dto.materialId,
          type: 'CONSUMPTION',
          quantity: -Math.abs(dto.quantity),
          unit: dto.unit,
          referenceType: 'ProductionOrder',
          referenceId: dto.productionOrderId,
        },
        tx as ScopedTx,
      );

      return created;
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
