import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createSalesOrder, getSalesOrder, listSalesOrders, updateSalesOrderStatus, type CreateSalesOrderInput, type SalesOrderStatus } from "./api";

export function useSalesOrders(page: number, search: string, status?: string) {
  return useQuery({ queryKey: ["sales-orders", page, search, status], queryFn: () => listSalesOrders({ page, search: search || undefined, status }) });
}

export function useSalesOrder(id: string) {
  return useQuery({ queryKey: ["sales-orders", id], queryFn: () => getSalesOrder(id), enabled: !!id });
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesOrderInput) => createSalesOrder(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Sales order created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create sales order"),
  });
}

export function useUpdateSalesOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: SalesOrderStatus) => updateSalesOrderStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update status"),
  });
}
