import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export interface CostSheet {
  id: string;
  productionOrderId: string | null;
  productionBatchId: string | null;
  productionOrder?: { id: string; orderNumber: string } | null;
  productionBatch?: { id: string; batchNumber: string } | null;
  materialCost: string;
  laborCost: string;
  machineCost: string;
  energyCost: string;
  packingCost: string;
  overheadCost: string;
  totalCost: string;
  estimatedCost: string | null;
  actualCost: string;
  variance: string | null;
  costPerUnit: string | null;
  createdAt: string;
}

export interface CreateCostSheetInput {
  productionOrderId?: string;
  productionBatchId?: string;
  materialCost: number;
  laborCost: number;
  machineCost: number;
  energyCost: number;
  packingCost: number;
  overheadCost: number;
  estimatedCost?: number;
}

export function listCostSheets(params: { page: number; productionOrderId?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.productionOrderId) qs.set("productionOrderId", params.productionOrderId);
  return api.get<CostSheet[]>(`/cost-sheets?${qs}`) as Promise<{ data: CostSheet[]; meta: PaginatedMeta }>;
}

export function createCostSheet(input: CreateCostSheetInput) {
  return api.post<CostSheet>("/cost-sheets", input);
}
