import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export const PAYROLL_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID"] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export interface PayrollEntry {
  id: string;
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
  baseSalary: string;
  overtimeAmount: string;
  incentiveAmount: string;
  deductions: string;
  netAmount: string;
}

export interface PayrollPeriod {
  id: string;
  factoryId: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  entries: PayrollEntry[];
}

export interface CreatePayrollPeriodInput {
  factoryId: string;
  periodStart: string;
  periodEnd: string;
}

export interface AddPayrollEntryInput {
  employeeId: string;
  baseSalary: number;
  overtimeAmount: number;
  incentiveAmount: number;
  deductions: number;
}

export function listPayrollPeriods(params: { page: number; factoryId?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.factoryId) qs.set("factoryId", params.factoryId);
  return api.get<PayrollPeriod[]>(`/payroll-periods?${qs}`) as Promise<{ data: PayrollPeriod[]; meta: PaginatedMeta }>;
}

export function getPayrollPeriod(id: string) {
  return api.get<PayrollPeriod>(`/payroll-periods/${id}`);
}

export function createPayrollPeriod(input: CreatePayrollPeriodInput) {
  return api.post<PayrollPeriod>("/payroll-periods", input);
}

export function addPayrollEntry(periodId: string, input: AddPayrollEntryInput) {
  return api.post<PayrollEntry>(`/payroll-periods/${periodId}/entries`, input);
}

export function updatePayrollPeriodStatus(id: string, status: PayrollStatus) {
  return api.patch<PayrollPeriod>(`/payroll-periods/${id}/status`, { status });
}
