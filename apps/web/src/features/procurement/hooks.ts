import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  createGoodsReceipt,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  updatePurchaseOrderStatus,
  type CreateGoodsReceiptInput,
  type CreatePurchaseOrderInput,
  type PurchaseOrderStatus,
} from "./api";

export function usePurchaseOrders(page: number, status?: string) {
  return useQuery({ queryKey: ["purchase-orders", page, status], queryFn: () => listPurchaseOrders({ page, status }) });
}

export function usePurchaseOrder(id: string) {
  return useQuery({ queryKey: ["purchase-orders", id], queryFn: () => getPurchaseOrder(id), enabled: !!id });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => createPurchaseOrder(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Purchase order created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create purchase order"),
  });
}

export function useUpdatePurchaseOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: PurchaseOrderStatus) => updatePurchaseOrderStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update status"),
  });
}

export function useCreateGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoodsReceiptInput) => createGoodsReceipt(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Goods receipt recorded — stock updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to record goods receipt"),
  });
}
