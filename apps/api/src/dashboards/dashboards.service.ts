import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextStore } from '../common/tenant-context';

const START_OF_TODAY = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const START_OF_MONTH = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * One real (non-fake) aggregation query per metric named in SRS §12.1–§12.6,
 * scoped to the caller's tenant via `prisma.db`. Kept intentionally simple —
 * these are the numbers the dashboards need, not a full BI layer.
 */
@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnerDashboard() {
    const [
      todayOutput,
      monthOutput,
      pendingOrders,
      totalSalesThisMonth,
      stockValueRows,
      machineCounts,
      qualityCounts,
      wastageAgg,
    ] = await Promise.all([
      this.prisma.db.productionBatch.aggregate({
        _sum: { outputQuantity: true },
        where: { createdAt: { gte: START_OF_TODAY() } },
      }),
      this.prisma.db.productionBatch.aggregate({
        _sum: { outputQuantity: true },
        where: { createdAt: { gte: START_OF_MONTH() } },
      }),
      this.prisma.db.salesOrder.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      this.prisma.db.salesOrder.aggregate({ _sum: { total: true }, where: { createdAt: { gte: START_OF_MONTH() } } }),
      this.prisma.db.stock.findMany({ select: { quantity: true } }),
      this.prisma.db.machine.groupBy({ by: ['status'], _count: true }),
      this.prisma.db.qualityInspection.groupBy({
        by: ['outcome'],
        _count: true,
        where: { createdAt: { gte: START_OF_MONTH() } },
      }),
      this.prisma.db.productionBatch.aggregate({
        _sum: { wastage: true },
        where: { createdAt: { gte: START_OF_MONTH() } },
      }),
    ]);

    return {
      productionToday: todayOutput._sum.outputQuantity ?? 0,
      productionThisMonth: monthOutput._sum.outputQuantity ?? 0,
      pendingSalesOrders: pendingOrders,
      salesThisMonth: totalSalesThisMonth._sum.total ?? 0,
      totalStockUnits: stockValueRows.reduce((sum, r) => sum + Number(r.quantity), 0),
      machineStatusCounts: Object.fromEntries(machineCounts.map((m) => [m.status, m._count])),
      qualityOutcomesThisMonth: Object.fromEntries(qualityCounts.map((q) => [q.outcome, q._count])),
      wastageThisMonth: wastageAgg._sum.wastage ?? 0,
    };
  }

  async getProductionDashboard() {
    const [orders, wip, batchAgg, delayedOrders] = await Promise.all([
      this.prisma.db.productionOrder.groupBy({ by: ['status'], _count: true }),
      this.prisma.db.productionOrder.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.db.productionBatch.aggregate({ _sum: { outputQuantity: true, wastage: true, rejection: true } }),
      this.prisma.db.productionOrder.count({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, plannedEndDate: { lt: new Date() } },
      }),
    ]);

    return {
      ordersByStatus: Object.fromEntries(orders.map((o) => [o.status, o._count])),
      workInProgressOrders: wip,
      totalOutput: batchAgg._sum.outputQuantity ?? 0,
      totalWastage: batchAgg._sum.wastage ?? 0,
      totalRejection: batchAgg._sum.rejection ?? 0,
      delayedOrders,
    };
  }

  async getMachineDashboard() {
    const [statusCounts, downtimeAgg, outputByMachine] = await Promise.all([
      this.prisma.db.machine.groupBy({ by: ['status'], _count: true }),
      this.prisma.db.downtime.aggregate({
        _sum: { durationMinutes: true },
        where: { createdAt: { gte: START_OF_MONTH() } },
      }),
      this.prisma.db.productionBatch.groupBy({
        by: ['machineId'],
        _sum: { outputQuantity: true },
        where: { machineId: { not: null }, createdAt: { gte: START_OF_MONTH() } },
      }),
    ]);

    return {
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
      totalDowntimeMinutesThisMonth: downtimeAgg._sum.durationMinutes ?? 0,
      outputByMachine: outputByMachine.map((o) => ({ machineId: o.machineId, output: o._sum.outputQuantity ?? 0 })),
    };
  }

  async getInventoryDashboard() {
    const [stockByProduct, stockByMaterial, lowStockMaterials, movementsThisMonth] = await Promise.all([
      this.prisma.db.stock.aggregate({ _sum: { quantity: true }, where: { productId: { not: null } } }),
      this.prisma.db.stock.aggregate({ _sum: { quantity: true }, where: { materialId: { not: null } } }),
      this.prisma.db.material.findMany({
        where: { reorderLevel: { not: null } },
        select: { id: true, name: true, code: true, reorderLevel: true, stock: { select: { quantity: true } } },
      }),
      this.prisma.db.stockMovement.count({ where: { createdAt: { gte: START_OF_MONTH() } } }),
    ]);

    const lowStock = lowStockMaterials
      .map((m) => ({ ...m, onHand: m.stock.reduce((sum, s) => sum + Number(s.quantity), 0) }))
      .filter((m) => m.reorderLevel !== null && m.onHand < Number(m.reorderLevel));

    return {
      totalFinishedGoodsUnits: stockByProduct._sum.quantity ?? 0,
      totalRawMaterialUnits: stockByMaterial._sum.quantity ?? 0,
      lowStockMaterials: lowStock.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        onHand: m.onHand,
        reorderLevel: m.reorderLevel,
      })),
      movementsThisMonth,
    };
  }

  /**
   * P0 remediation (TEN-001): `topDefects` previously called `prisma.raw.defect.groupBy(...)`
   * with no `where` clause at all. `Defect` has no `tenantId` column of its own — it is a
   * child of `QualityInspection` and inherits tenant scope only through that relation — so
   * bypassing `.db` here meant the query had no tenant boundary whatsoever and aggregated
   * defect-type counts across every tenant on the platform. Fixed by explicitly filtering
   * through the parent `qualityInspection.tenantId` relation, using the tenant id from the
   * current request context (never client input) rather than switching to `.db` (which
   * would not auto-scope `Defect` anyway, since it is intentionally not in
   * `TENANT_SCOPED_MODELS` — see D-014's documented child-model pattern).
   */
  async getQualityDashboard() {
    const ctx = TenantContextStore.getOrThrow();
    // Fail closed exactly like the tenant-scoping Prisma extension does for `.db` calls —
    // never let a missing tenantId silently fall through to an unfiltered `.raw` query.
    if (!ctx.tenantId) throw new Error('getQualityDashboard requires a tenant context');
    const tenantId = ctx.tenantId;

    const [outcomeCounts, topDefects] = await Promise.all([
      this.prisma.db.qualityInspection.groupBy({ by: ['outcome'], _count: true }),
      this.prisma.raw.defect.groupBy({
        by: ['defectType'],
        _count: true,
        where: { qualityInspection: { tenantId } },
        orderBy: { _count: { defectType: 'desc' } },
        take: 5,
      }),
    ]);

    const total = outcomeCounts.reduce((sum, o) => sum + o._count, 0);
    const rejected = outcomeCounts.find((o) => o.outcome === 'REJECT')?._count ?? 0;

    return {
      totalInspections: total,
      outcomeCounts: Object.fromEntries(outcomeCounts.map((o) => [o.outcome, o._count])),
      rejectionRatePct: total > 0 ? Math.round((rejected / total) * 1000) / 10 : 0,
      topDefects: topDefects.map((d) => ({ defectType: d.defectType, count: d._count })),
    };
  }

  async getMaintenanceDashboard() {
    const [openJobs, breakdownMachines, costAgg, downtimeAgg, dueSoon, jobsByMachine] = await Promise.all([
      this.prisma.db.maintenanceJob.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.db.machine.count({ where: { status: 'BREAKDOWN' } }),
      this.prisma.db.maintenanceJob.aggregate({
        _sum: { cost: true },
        where: { createdAt: { gte: START_OF_MONTH() } },
      }),
      this.prisma.db.downtime.aggregate({
        _sum: { durationMinutes: true },
        where: { createdAt: { gte: START_OF_MONTH() } },
      }),
      this.prisma.db.maintenanceSchedule.count({
        where: { nextDueAt: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
      }),
      this.prisma.db.maintenanceJob.groupBy({
        by: ['machineId'],
        _count: true,
        orderBy: { _count: { machineId: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      openJobs,
      breakdownMachines,
      maintenanceCostThisMonth: costAgg._sum.cost ?? 0,
      totalDowntimeMinutesThisMonth: downtimeAgg._sum.durationMinutes ?? 0,
      preventiveMaintenanceDueSoon: dueSoon,
      mostProblematicMachines: jobsByMachine.map((j) => ({ machineId: j.machineId, jobCount: j._count })),
    };
  }
}
