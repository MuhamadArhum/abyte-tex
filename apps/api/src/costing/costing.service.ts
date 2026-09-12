import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateCostSheetDto } from './dto/cost-sheet.dto';

@Injectable()
export class CostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Computes totalCost, variance, and cost-per-unit (against the batch's output, if linked to one) — SRS §11. */
  async create(dto: CreateCostSheetDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Cost sheets can only be created within a tenant context');

    const totalCost =
      dto.materialCost + dto.laborCost + dto.machineCost + dto.energyCost + dto.packingCost + dto.overheadCost;
    const variance = dto.estimatedCost !== undefined ? totalCost - dto.estimatedCost : undefined;

    let costPerUnit: number | undefined;
    if (dto.productionBatchId) {
      const batch = await this.prisma.db.productionBatch.findUnique({ where: { id: dto.productionBatchId } });
      if (!batch) throw new NotFoundException('Production batch not found');
      const output = Number(batch.outputQuantity);
      if (output > 0) costPerUnit = totalCost / output;
    }

    const costSheet = await this.prisma.db.costSheet.create({
      data: {
        tenantId: ctx.tenantId,
        productionOrderId: dto.productionOrderId,
        productionBatchId: dto.productionBatchId,
        materialCost: dto.materialCost,
        laborCost: dto.laborCost,
        machineCost: dto.machineCost,
        energyCost: dto.energyCost,
        packingCost: dto.packingCost,
        overheadCost: dto.overheadCost,
        totalCost,
        estimatedCost: dto.estimatedCost,
        actualCost: totalCost,
        variance,
        costPerUnit,
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'CostSheet',
      entityId: costSheet.id,
      newValue: { totalCost },
    });
    return costSheet;
  }

  async list(query: PaginationQueryDto & { productionOrderId?: string }) {
    const where = query.productionOrderId ? { productionOrderId: query.productionOrderId } : {};
    const [items, total] = await Promise.all([
      this.prisma.db.costSheet.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.costSheet.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const costSheet = await this.prisma.db.costSheet.findUnique({
      where: { id },
      include: {
        productionOrder: { select: { id: true, orderNumber: true } },
        productionBatch: { select: { id: true, batchNumber: true } },
      },
    });
    if (!costSheet) throw new NotFoundException('Cost sheet not found');
    return costSheet;
  }
}
