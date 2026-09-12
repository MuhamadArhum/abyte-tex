import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
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

  /** Records an inspection with its defects (SRS §9.1) and, on REJECT/HOLD, flags the batch for follow-up by updating its status. */
  async createInspection(dto: CreateQualityInspectionDto, inspectedBy: string) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Inspections can only be recorded within a tenant context');

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

    if (dto.productionBatchId && (dto.outcome === 'REJECT' || dto.outcome === 'HOLD')) {
      await this.prisma.db.productionBatch.update({ where: { id: dto.productionBatchId }, data: { status: 'HOLD' } });
    }

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'QualityInspection',
      entityId: inspection.id,
      newValue: { inspectionNumber, outcome: dto.outcome },
    });
    return inspection;
  }

  async list(query: PaginationQueryDto & { factoryId?: string; outcome?: string }) {
    const where = {
      ...(query.factoryId ? { factoryId: query.factoryId } : {}),
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
    return inspection;
  }
}
