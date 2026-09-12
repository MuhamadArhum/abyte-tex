import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createDispatch, getDispatch, listDispatches, type CreateDispatchInput } from "./api";

export function useDispatches(page: number, salesOrderId?: string) {
  return useQuery({ queryKey: ["dispatches", page, salesOrderId], queryFn: () => listDispatches({ page, salesOrderId }) });
}

export function useDispatch(id: string) {
  return useQuery({ queryKey: ["dispatches", id], queryFn: () => getDispatch(id), enabled: !!id });
}

export function useCreateDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDispatchInput) => createDispatch(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatches"] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Dispatch created — stock issued");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create dispatch"),
  });
}
