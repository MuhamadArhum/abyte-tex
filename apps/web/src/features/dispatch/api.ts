import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export interface DispatchItem {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string };
  salesOrderItemId: string | null;
  quantity: string;
  unit: string;
  batchNumber: string | null;
}

export interface Dispatch {
  id: string;
  dispatchNumber: string;
  status: string;
  salesOrderId: string;
  salesOrder: { id: string; orderNumber: string; customer?: { id: string; name: string } };
  warehouse?: { id: string; name: string };
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  deliveryAddress: string | null;
  dispatchDate: string;
  items: DispatchItem[];
}

export interface CreateDispatchInput {
  factoryId: string;
  salesOrderId: string;
  warehouseId: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  deliveryAddress?: string;
  items: Array<{ productId: string; salesOrderItemId?: string; quantity: number; unit: string; batchNumber?: string }>;
}

export function listDispatches(params: { page: number; salesOrderId?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.salesOrderId) qs.set("salesOrderId", params.salesOrderId);
  return api.get<Dispatch[]>(`/dispatches?${qs}`) as Promise<{ data: Dispatch[]; meta: PaginatedMeta }>;
}

export function getDispatch(id: string) {
  return api.get<Dispatch>(`/dispatches/${id}`);
}

export function createDispatch(input: CreateDispatchInput) {
  return api.post<Dispatch>("/dispatches", input);
}
