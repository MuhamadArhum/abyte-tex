import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export const MAINTENANCE_JOB_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type MaintenanceJobStatus = (typeof MAINTENANCE_JOB_STATUSES)[number];

export interface MaintenanceJob {
  id: string;
  jobType: string;
  status: MaintenanceJobStatus;
  machine: { id: string; name: string; machineCode: string };
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  technicianId: string | null;
  cost: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateMaintenanceJobInput {
  factoryId: string;
  machineId: string;
  scheduledDate?: string;
  technicianId?: string;
  notes?: string;
}

export interface UpdateMaintenanceJobInput {
  status?: MaintenanceJobStatus;
  startedAt?: string;
  completedAt?: string;
  technicianId?: string;
  cost?: number;
  notes?: string;
}

export function listMaintenanceJobs(params: { page: number; machineId?: string; status?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.machineId) qs.set("machineId", params.machineId);
  if (params.status) qs.set("status", params.status);
  return api.get<MaintenanceJob[]>(`/maintenance-jobs?${qs}`) as Promise<{ data: MaintenanceJob[]; meta: PaginatedMeta }>;
}

export function getMaintenanceJob(id: string) {
  return api.get<MaintenanceJob>(`/maintenance-jobs/${id}`);
}

export function createMaintenanceJob(input: CreateMaintenanceJobInput) {
  return api.post<MaintenanceJob>("/maintenance-jobs", input);
}

export function updateMaintenanceJob(id: string, input: UpdateMaintenanceJobInput) {
  return api.patch<MaintenanceJob>(`/maintenance-jobs/${id}`, input);
}
