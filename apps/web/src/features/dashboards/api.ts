import { api } from "@/lib/api-client";

export interface OwnerDashboard {
  productionToday: string | number;
  productionThisMonth: string | number;
  pendingSalesOrders: number;
  salesThisMonth: string | number;
  totalStockUnits: number;
  machineStatusCounts: Record<string, number>;
  qualityOutcomesThisMonth: Record<string, number>;
  wastageThisMonth: string | number;
}

export interface ProductionDashboard {
  ordersByStatus: Record<string, number>;
  workInProgressOrders: number;
  totalOutput: string | number;
  totalWastage: string | number;
  totalRejection: string | number;
  delayedOrders: number;
}

export interface MachineDashboard {
  statusCounts: Record<string, number>;
  totalDowntimeMinutesThisMonth: number;
  outputByMachine: Array<{ machineId: string; output: string | number }>;
}

export interface InventoryDashboard {
  totalFinishedGoodsUnits: string | number;
  totalRawMaterialUnits: string | number;
  lowStockMaterials: Array<{ id: string; name: string; code: string; onHand: number; reorderLevel: string }>;
  movementsThisMonth: number;
}

export interface QualityDashboard {
  totalInspections: number;
  outcomeCounts: Record<string, number>;
  rejectionRatePct: number;
  topDefects: Array<{ defectType: string; count: number }>;
}

export interface MaintenanceDashboard {
  openJobs: number;
  breakdownMachines: number;
  maintenanceCostThisMonth: string | number;
  totalDowntimeMinutesThisMonth: number;
  preventiveMaintenanceDueSoon: number;
  mostProblematicMachines: Array<{ machineId: string; jobCount: number }>;
}

export const getOwnerDashboard = () => api.get<OwnerDashboard>("/dashboards/owner");
export const getProductionDashboard = () => api.get<ProductionDashboard>("/dashboards/production");
export const getMachineDashboard = () => api.get<MachineDashboard>("/dashboards/machines");
export const getInventoryDashboard = () => api.get<InventoryDashboard>("/dashboards/inventory");
export const getQualityDashboard = () => api.get<QualityDashboard>("/dashboards/quality");
export const getMaintenanceDashboard = () => api.get<MaintenanceDashboard>("/dashboards/maintenance");
