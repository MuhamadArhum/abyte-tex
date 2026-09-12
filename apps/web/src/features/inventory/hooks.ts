import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { getStockLevels, listMovements, recordMovement, transferStock, type RecordMovementInput, type TransferStockInput } from "./api";

export function useStockLevels(page: number, warehouseId?: string) {
  return useQuery({ queryKey: ["stock", page, warehouseId], queryFn: () => getStockLevels({ page, warehouseId }) });
}

export function useStockMovements(page: number, warehouseId?: string) {
  return useQuery({ queryKey: ["stock-movements", page, warehouseId], queryFn: () => listMovements({ page, warehouseId }) });
}

export function useRecordMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordMovementInput) => recordMovement(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Movement recorded");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to record movement"),
  });
}

export function useTransferStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferStockInput) => transferStock(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Stock transferred");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to transfer stock"),
  });
}
