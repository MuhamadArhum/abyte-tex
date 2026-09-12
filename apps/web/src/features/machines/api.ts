import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type MachineStatus = "RUNNING" | "IDLE" | "BREAKDOWN" | "MAINTENANCE" | "OFFLINE";

export interface Machine {
  id: string;
  machineCode: string;
  name: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  location: string | null;
  capacity: string | null;
  status: MachineStatus;
  factoryId: string;
}

export interface CreateMachineInput {
  machineCode: string;
  name: string;
  type: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  location?: string;
  capacity?: string;
}

export function listMachines(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<Machine[]>(`/machines?${qs}`) as Promise<{ data: Machine[]; meta: PaginatedMeta }>;
}

export function createMachine(factoryId: string, input: CreateMachineInput) {
  return api.post<Machine>(`/factories/${factoryId}/machines`, input);
}

export function updateMachine(id: string, input: Partial<CreateMachineInput> & { status?: MachineStatus }) {
  return api.patch<Machine>(`/machines/${id}`, input);
}
