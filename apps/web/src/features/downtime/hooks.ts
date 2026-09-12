import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { closeDowntime, createDowntime, listDowntime, type CreateDowntimeInput } from "./api";

export function useDowntimeRecords(page: number, machineId?: string) {
  return useQuery({ queryKey: ["downtime", page, machineId], queryFn: () => listDowntime({ page, machineId }) });
}

export function useCreateDowntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDowntimeInput) => createDowntime(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["downtime"] });
      qc.invalidateQueries({ queryKey: ["machines"] });
      qc.invalidateQueries({ queryKey: ["maintenance-jobs"] });
      toast.success("Downtime recorded");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to record downtime"),
  });
}

export function useCloseDowntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endTime }: { id: string; endTime: string }) => closeDowntime(id, endTime),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["downtime"] });
      qc.invalidateQueries({ queryKey: ["machines"] });
      toast.success("Downtime closed");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to close downtime"),
  });
}
