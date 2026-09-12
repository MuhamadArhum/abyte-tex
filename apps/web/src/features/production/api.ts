import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type ProductionOrderStatus = "PLANNED" | "RELEASED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
export const PRODUCTION_ORDER_STATUSES: ProductionOrderStatus[] = ["PLANNED", "RELEASED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"];

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  productId: string;
  product: { id: string; name: string; sku: string; unit?: string };
  quantity: string;
  unit: string;
  status: ProductionOrderStatus;
  priority: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  factory?: { id: string; name: string; code: string };
  batches?: ProductionBatch[];
  materialConsumptions?: Array<{ id: string; material: { name: string; code: string }; quantity: string; unit: string }>;
}

export interface ProductionBatch {
  id: string;
  batchNumber: string;
  inputQuantity: string;
  outputQuantity: string;
  wastage: string;
  rework: string;
  rejection: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
}

export interface CreateProductionOrderInput {
  factoryId: string;
  productId: string;
  quantity: number;
  unit: string;
  salesOrderId?: string;
}

export function listProductionOrders(params: { page: number; status?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.status) qs.set("status", params.status);
  return api.get<ProductionOrder[]>(`/production-orders?${qs}`) as Promise<{ data: ProductionOrder[]; meta: PaginatedMeta }>;
}

export function getProductionOrder(id: string) {
  return api.get<ProductionOrder>(`/production-orders/${id}`);
}

export function createProductionOrder(input: CreateProductionOrderInput) {
  return api.post<ProductionOrder>("/production-orders", input);
}

export function updateProductionOrderStatus(id: string, status: ProductionOrderStatus) {
  return api.patch<ProductionOrder>(`/production-orders/${id}/status`, { status });
}

export function createBatch(input: { productionOrderId: string; inputQuantity: number }) {
  return api.post<ProductionBatch>("/production-batches", input);
}

export function recordBatchOutput(id: string, input: { outputQuantity: number; wastage?: number; rework?: number; rejection?: number; outputWarehouseId?: string }) {
  return api.patch<ProductionBatch>(`/production-batches/${id}/output`, input);
}

export function recordMaterialConsumption(input: { productionOrderId: string; materialId: string; warehouseId: string; quantity: number; unit: string }) {
  return api.post("/material-consumptions", input);
}
