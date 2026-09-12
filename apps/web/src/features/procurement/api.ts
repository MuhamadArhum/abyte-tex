import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = ["DRAFT", "APPROVED", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

export interface PurchaseOrderItem {
  id: string;
  materialId: string | null;
  material: { id: string; name: string; code: string } | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  receivedQty: string;
  rejectedQty: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: { id: string; name: string };
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate: string | null;
  subtotal: string;
  total: string;
  items: PurchaseOrderItem[];
  factory?: { id: string; name: string; code: string };
  goodsReceipts?: Array<{ id: string; receiptNumber: string; status: string }>;
}

export interface CreatePurchaseOrderInput {
  factoryId: string;
  supplierId: string;
  expectedDate?: string;
  items: Array<{ materialId: string; quantity: number; unit: string; unitPrice: number }>;
}

export function listPurchaseOrders(params: { page: number; status?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.status) qs.set("status", params.status);
  return api.get<PurchaseOrder[]>(`/purchase-orders?${qs}`) as Promise<{ data: PurchaseOrder[]; meta: PaginatedMeta }>;
}

export function getPurchaseOrder(id: string) {
  return api.get<PurchaseOrder>(`/purchase-orders/${id}`);
}

export function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  return api.post<PurchaseOrder>("/purchase-orders", input);
}

export function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
  return api.patch<PurchaseOrder>(`/purchase-orders/${id}/status`, { status });
}

export interface CreateGoodsReceiptInput {
  purchaseOrderId: string;
  warehouseId: string;
  items: Array<{ purchaseOrderItemId: string; receivedQty: number; acceptedQty: number; rejectedQty?: number }>;
}

export function createGoodsReceipt(input: CreateGoodsReceiptInput) {
  return api.post("/goods-receipts", input);
}
