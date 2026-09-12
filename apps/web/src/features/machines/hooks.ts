import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createMachine, listMachines, updateMachine, type CreateMachineInput, type MachineStatus } from "./api";

export function useMachines(page: number, search: string) {
  return useQuery({ queryKey: ["machines", page, search], queryFn: () => listMachines({ page, search: search || undefined }) });
}

export function useCreateMachine(factoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMachineInput) => createMachine(factoryId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machines"] });
      toast.success("Machine created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create machine"),
  });
}

export function useUpdateMachine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateMachineInput> & { status?: MachineStatus }) => updateMachine(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machines"] });
      toast.success("Machine updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update machine"),
  });
}
