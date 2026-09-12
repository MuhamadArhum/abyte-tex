import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type ManualMovementType = "RECEIVE" | "ISSUE" | "ADJUSTMENT" | "RETURN";
export const MANUAL_MOVEMENT_TYPES: ManualMovementType[] = ["RECEIVE", "ISSUE", "ADJUSTMENT", "RETURN"];

export interface StockRow {
  id: string;
  warehouse: { id: string; name: string; code: string };
  product: { id: string; name: string; sku: string } | null;
  material: { id: string; name: string; code: string } | null;
  batchNumber: string | null;
  quantity: string;
  unit: string;
  updatedAt: string;
}

export interface StockMovementRow {
  id: string;
  warehouse: { id: string; name: string; code: string };
  product: { id: string; name: string; sku: string } | null;
  material: { id: string; name: string; code: string } | null;
  batchNumber: string | null;
  type: string;
  quantity: string;
  unit: string;
  notes: string | null;
  createdAt: string;
}

export interface RecordMovementInput {
  warehouseId: string;
  locationId?: string;
  productId?: string;
  materialId?: string;
  batchNumber?: string;
  type: ManualMovementType;
  quantity: number;
  unit: string;
  decrease?: boolean;
  notes?: string;
}

export interface TransferStockInput {
  fromWarehouseId: string;
  fromLocationId?: string;
  toWarehouseId: string;
  toLocationId?: string;
  productId?: string;
  materialId?: string;
  batchNumber?: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export function getStockLevels(params: { page: number; warehouseId?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.warehouseId) qs.set("warehouseId", params.warehouseId);
  return api.get<StockRow[]>(`/inventory/stock?${qs}`) as Promise<{ data: StockRow[]; meta: PaginatedMeta }>;
}

export function listMovements(params: { page: number; warehouseId?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.warehouseId) qs.set("warehouseId", params.warehouseId);
  return api.get<StockMovementRow[]>(`/inventory/movements?${qs}`) as Promise<{ data: StockMovementRow[]; meta: PaginatedMeta }>;
}

export function recordMovement(input: RecordMovementInput) {
  return api.post("/inventory/movements", input);
}

export function transferStock(input: TransferStockInput) {
  return api.post("/inventory/transfer", input);
}
