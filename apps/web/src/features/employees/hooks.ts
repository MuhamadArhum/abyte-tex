import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createEmployee, listEmployees, updateEmployee, type CreateEmployeeInput, type EmploymentStatus } from "./api";

export function useEmployees(page: number, search: string) {
  return useQuery({ queryKey: ["employees", page, search], queryFn: () => listEmployees({ page, search: search || undefined }) });
}

export function useCreateEmployee(factoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(factoryId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create employee"),
  });
}

export function useUpdateEmployee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateEmployeeInput> & { employmentStatus?: EmploymentStatus }) => updateEmployee(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update employee"),
  });
}
