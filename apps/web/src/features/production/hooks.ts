import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  createBatch,
  createProductionOrder,
  getProductionOrder,
  listProductionOrders,
  recordBatchOutput,
  recordMaterialConsumption,
  updateProductionOrderStatus,
  type CreateProductionOrderInput,
  type ProductionOrderStatus,
} from "./api";

export function useProductionOrders(page: number, status?: string) {
  return useQuery({ queryKey: ["production-orders", page, status], queryFn: () => listProductionOrders({ page, status }) });
}

export function useProductionOrder(id: string) {
  return useQuery({ queryKey: ["production-orders", id], queryFn: () => getProductionOrder(id), enabled: !!id });
}

export function useCreateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductionOrderInput) => createProductionOrder(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      toast.success("Production order created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create production order"),
  });
}

export function useUpdateProductionOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: ProductionOrderStatus) => updateProductionOrderStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update status"),
  });
}

export function useCreateBatch(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inputQuantity: number) => createBatch({ productionOrderId: orderId, inputQuantity }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders", orderId] });
      toast.success("Batch started");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to start batch"),
  });
}

export function useRecordBatchOutput(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; outputQuantity: number; wastage?: number; rework?: number; rejection?: number; outputWarehouseId?: string }) =>
      recordBatchOutput(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders", orderId] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Output recorded — stock updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to record output"),
  });
}

export function useRecordConsumption(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { materialId: string; warehouseId: string; quantity: number; unit: string }) =>
      recordMaterialConsumption({ productionOrderId: orderId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders", orderId] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Material consumption recorded");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to record consumption"),
  });
}
