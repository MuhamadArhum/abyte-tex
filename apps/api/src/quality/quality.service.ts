import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateInspectionTemplateDto } from './dto/inspection-template.dto';
import { CreateQualityInspectionDto } from './dto/quality-inspection.dto';

@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createTemplate(dto: CreateInspectionTemplateDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Templates can only be created within a tenant context');

    return this.prisma.db.inspectionTemplate.create({
      data: { tenantId: ctx.tenantId, name: dto.name, appliesTo: dto.appliesTo, checklistItems: dto.checklistItems },
    });
  }

  async listTemplates() {
    return this.prisma.db.inspectionTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Records an inspection with its defects (SRS §9.1). `QualityInspection`
   * rows are append-only — there is deliberately no update/edit endpoint
   * anywhere in this module, so a finalized outcome cannot be altered after
   * the fact by anyone, matching SRS §9.1/§9.2's traceability intent.
   *
   * P1 remediation (Step 8 — quality workflow): on REJECT/HOLD, the linked
   * batch is flagged HOLD as before. On PASS against a batch that is
   * *currently* HOLD, this inspection now explicitly releases it — a
   * re-inspection that passes is the natural way a held batch becomes
   * shippable again, rather than only a raw, quality-blind status PATCH.
   * Both the inspection itself and the batch-status side effect are
   * separately audit-logged (closes WF-016 — previously only the inspection
   * was logged, leaving the batch's own history silent about why it changed).
   */
  async createInspection(dto: CreateQualityInspectionDto, inspectedBy: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Inspections can only be recorded within a tenant context');
    assertFactoryAccess(ctx, dto.factoryId);

    const inspectionNumber = `QI-${String((await this.prisma.db.qualityInspection.count()) + 1).padStart(6, '0')}`;

    const inspection = await this.prisma.db.qualityInspection.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: dto.factoryId,
        inspectionNumber,
        templateId: dto.templateId,
        productionBatchId: dto.productionBatchId,
        goodsReceiptId: dto.goodsReceiptId,
        salesOrderId: dto.salesOrderId,
        inspectedBy,
        outcome: dto.outcome,
        gsm: dto.gsm,
        width: dto.width,
        shade: dto.shade,
        rollLength: dto.rollLength,
        weight: dto.weight,
        colorVariation: dto.colorVariation,
        stitchingDefects: dto.stitchingDefects,
        notes: dto.notes,
        defects: dto.defects ? { create: dto.defects } : undefined,
      },
      include: { defects: true },
    });

    if (dto.productionBatchId) {
      const batch = await this.prisma.db.productionBatch.findUnique({ where: { id: dto.productionBatchId } });
      if (batch && (dto.outcome === 'REJECT' || dto.outcome === 'HOLD') && batch.status !== 'HOLD') {
        await this.prisma.db.productionBatch.update({ where: { id: dto.productionBatchId }, data: { status: 'HOLD' } });
        await this.auditService.log({
          action: 'UPDATE',
          entityType: 'ProductionBatch',
          entityId: dto.productionBatchId,
          oldValue: { status: batch.status },
          newValue: { status: 'HOLD', reason: `Quality inspection ${inspectionNumber}: ${dto.outcome}` },
        });
      } else if (batch && dto.outcome === 'PASS' && batch.status === 'HOLD') {
        const released = Number(batch.outputQuantity) > 0 ? 'COMPLETED' : 'IN_PROGRESS';
        await this.prisma.db.productionBatch.update({
          where: { id: dto.productionBatchId },
          data: { status: released },
        });
        await this.auditService.log({
          action: 'UPDATE',
          entityType: 'ProductionBatch',
          entityId: dto.productionBatchId,
          oldValue: { status: 'HOLD' },
          newValue: { status: released, reason: `Quality inspection ${inspectionNumber}: PASS (released hold)` },
        });
      }
    }

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'QualityInspection',
      entityId: inspection.id,
      newValue: { inspectionNumber, outcome: dto.outcome },
    });
    return inspection;
  }

  /**
   * P1 remediation (Step 7 — domain-level quality rule, not duplicated per
   * caller): the single place that decides whether a batch's current quality
   * status permits it to ship. `DispatchService.create()` calls this instead
   * of re-deriving the same HOLD check inline, so any future caller (a
   * different dispatch path, a future export/packing step) gets the same
   * rule for free rather than a second, possibly-drifting copy of it.
   */
  async assertBatchShippable(batchNumber: string): Promise<void> {
    const batch = await this.prisma.db.productionBatch.findFirst({ where: { batchNumber } });
    if (batch?.status === 'HOLD') {
      throw new ForbiddenException(
        `Batch "${batchNumber}" is on quality hold (rejected or held pending review) and cannot be dispatched`,
      );
    }
  }

  async list(query: PaginationQueryDto & { factoryId?: string; outcome?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = {
      ...factoryScopeFilter(ctx, query.factoryId),
      ...(query.outcome ? { outcome: query.outcome as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.qualityInspection.findMany({
        where,
        include: { defects: true },
        skip: query.skip,
        take: query.take,
        orderBy: { inspectionDate: 'desc' },
      }),
      this.prisma.db.qualityInspection.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  /** Full traceability chain per SRS §9.2: Customer Order -> Production Order -> Batch -> Machine -> Quality Inspection. */
  async getById(id: string) {
    const inspection = await this.prisma.db.qualityInspection.findUnique({
      where: { id },
      include: {
        defects: true,
        productionBatch: {
          include: {
            machine: { select: { id: true, name: true, machineCode: true } },
            productionOrder: {
              include: {
                salesOrder: { select: { id: true, orderNumber: true, customer: { select: { id: true, name: true } } } },
              },
            },
          },
        },
        salesOrder: { select: { id: true, orderNumber: true } },
      },
    });
    if (!inspection) throw new NotFoundException('Quality inspection not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), inspection.factoryId);
    return inspection;
  }
}
