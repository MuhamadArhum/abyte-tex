import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createShift, listShifts, updateShift, type CreateShiftInput } from "./api";

export function useShifts(factoryId: string) {
  return useQuery({ queryKey: ["shifts", factoryId], queryFn: () => listShifts(factoryId), enabled: !!factoryId });
}

export function useCreateShift(factoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShiftInput) => createShift(factoryId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts", factoryId] });
      toast.success("Shift created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create shift"),
  });
}

export function useUpdateShift(factoryId: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateShiftInput>) => updateShift(factoryId, id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts", factoryId] });
      toast.success("Shift updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update shift"),
  });
}
