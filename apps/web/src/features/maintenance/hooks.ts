import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  createMaintenanceJob,
  listMaintenanceJobs,
  updateMaintenanceJob,
  type CreateMaintenanceJobInput,
  type UpdateMaintenanceJobInput,
} from "./api";

export function useMaintenanceJobs(page: number, status?: string) {
  return useQuery({ queryKey: ["maintenance-jobs", page, status], queryFn: () => listMaintenanceJobs({ page, status }) });
}

export function useCreateMaintenanceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaintenanceJobInput) => createMaintenanceJob(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-jobs"] });
      toast.success("Maintenance job created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create job"),
  });
}

export function useUpdateMaintenanceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateMaintenanceJobInput) => updateMaintenanceJob(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-jobs"] });
      toast.success("Job updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update job"),
  });
}
