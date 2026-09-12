import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  addPayrollEntry,
  createPayrollPeriod,
  getPayrollPeriod,
  listPayrollPeriods,
  updatePayrollPeriodStatus,
  type AddPayrollEntryInput,
  type CreatePayrollPeriodInput,
  type PayrollStatus,
} from "./api";

export function usePayrollPeriods(page: number, factoryId?: string) {
  return useQuery({ queryKey: ["payroll-periods", page, factoryId], queryFn: () => listPayrollPeriods({ page, factoryId }) });
}

export function usePayrollPeriod(id: string) {
  return useQuery({ queryKey: ["payroll-periods", id], queryFn: () => getPayrollPeriod(id), enabled: !!id });
}

export function useCreatePayrollPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePayrollPeriodInput) => createPayrollPeriod(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast.success("Payroll period created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create payroll period"),
  });
}

export function useAddPayrollEntry(periodId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPayrollEntryInput) => addPayrollEntry(periodId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-periods", periodId] });
      toast.success("Entry saved");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to save entry"),
  });
}

export function useUpdatePayrollPeriodStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: PayrollStatus) => updatePayrollPeriodStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update status"),
  });
}
