import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createCostSheet, listCostSheets, type CreateCostSheetInput } from "./api";

export function useCostSheets(page: number, productionOrderId?: string) {
  return useQuery({ queryKey: ["cost-sheets", page, productionOrderId], queryFn: () => listCostSheets({ page, productionOrderId }) });
}

export function useCreateCostSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCostSheetInput) => createCostSheet(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cost-sheets"] });
      toast.success("Cost sheet created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create cost sheet"),
  });
}
