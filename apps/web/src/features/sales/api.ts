import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type SalesOrderStatus =
  | "DRAFT" | "CONFIRMED" | "PRODUCTION_PLANNED" | "IN_PRODUCTION" | "QUALITY" | "READY" | "DISPATCHED" | "COMPLETED" | "CANCELLED";

export const SALES_ORDER_STATUSES: SalesOrderStatus[] = [
  "DRAFT", "CONFIRMED", "PRODUCTION_PLANNED", "IN_PRODUCTION", "QUALITY", "READY", "DISPATCHED", "COMPLETED", "CANCELLED",
];

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
