import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type SalesOrderStatus =
  | "DRAFT" | "CONFIRMED" | "PRODUCTION_PLANNED" | "IN_PRODUCTION" | "QUALITY" | "READY" | "DISPATCHED" | "COMPLETED" | "CANCELLED";

export const SALES_ORDER_STATUSES: SalesOrderStatus[] = [
  "DRAFT", "CONFIRMED", "PRODUCTION_PLANNED", "IN_PRODUCTION", "QUALITY", "READY", "DISPATCHED", "COMPLETED", "CANCELLED",
];

/**
 * P1 remediation (Step 15 / FE-013): mirrors the backend's
 * `SALES_ORDER_MANUAL_TRANSITIONS` (apps/api/src/sales/sales.service.ts)
 * exactly. The frontend dropdown now only *offers* a legal next state — the
 * backend remains the authoritative enforcement point regardless (this is a
 * UX improvement, not a security boundary: a direct API call is still
 * validated server-side the same way it always was). READY and DISPATCHED
 * are intentionally absent everywhere — they are system-set only, by
 * creating a real Dispatch.
 */
export const SALES_ORDER_ALLOWED_NEXT_STATUSES: Partial<Record<SalesOrderStatus, SalesOrderStatus[]>> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PRODUCTION_PLANNED", "CANCELLED"],
  PRODUCTION_PLANNED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["QUALITY", "CANCELLED"],
  QUALITY: ["READY", "CANCELLED"],
  READY: ["CANCELLED"],
  DISPATCHED: ["COMPLETED"],
};

/** Transitions that should be confirmed before firing — terminal or otherwise hard to walk back. */
export const SALES_ORDER_DESTRUCTIVE_STATUSES = new Set<SalesOrderStatus>(["CANCELLED", "COMPLETED"]);

export interface SalesOrderItem {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string; unit?: string };
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  lineTotal: string;
  deliveredQty: string;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customer: { id: string; name: string };
  status: SalesOrderStatus;
  orderDate: string;
  deliveryDate: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes: string | null;
  items: SalesOrderItem[];
  factory?: { id: string; name: string; code: string };
}

export interface CreateSalesOrderItemInput {
  productId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount?: number;
}

export interface CreateSalesOrderInput {
  factoryId: string;
  customerId: string;
  deliveryDate?: string;
  discount?: number;
  tax?: number;
  notes?: string;
  items: CreateSalesOrderItemInput[];
}

export function listSalesOrders(params: { page: number; search?: string; status?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  return api.get<SalesOrder[]>(`/sales-orders?${qs}`) as Promise<{ data: SalesOrder[]; meta: PaginatedMeta }>;
}

export function getSalesOrder(id: string) {
  return api.get<SalesOrder>(`/sales-orders/${id}`);
}

export function createSalesOrder(input: CreateSalesOrderInput) {
  return api.post<SalesOrder>("/sales-orders", input);
}

export function updateSalesOrderStatus(id: string, status: SalesOrderStatus) {
  return api.patch<SalesOrder>(`/sales-orders/${id}/status`, { status });
}
