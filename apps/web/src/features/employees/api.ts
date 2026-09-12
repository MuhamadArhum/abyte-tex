import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type EmploymentStatus = "ACTIVE" | "INACTIVE" | "TERMINATED" | "ON_LEAVE";

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  employmentStatus: EmploymentStatus;
  department?: { id: string; name: string } | null;
  shift?: { id: string; name: string } | null;
}

export interface CreateEmployeeInput {
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation?: string;
  phone?: string;
  email?: string;
}

export function listEmployees(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<Employee[]>(`/employees?${qs}`) as Promise<{ data: Employee[]; meta: PaginatedMeta }>;
}

export function createEmployee(factoryId: string, input: CreateEmployeeInput) {
  return api.post<Employee>(`/factories/${factoryId}/employees`, input);
}

export function updateEmployee(id: string, input: Partial<CreateEmployeeInput> & { employmentStatus?: EmploymentStatus }) {
  return api.patch<Employee>(`/employees/${id}`, input);
}
