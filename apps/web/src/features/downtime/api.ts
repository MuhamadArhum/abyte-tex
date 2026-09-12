import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type DowntimeCategory =
  | "MECHANICAL" | "ELECTRICAL" | "MATERIAL_SHORTAGE" | "OPERATOR_ISSUE" | "MAINTENANCE" | "POWER_FAILURE" | "PRODUCTION_CHANGEOVER" | "OTHER";
export const DOWNTIME_CATEGORIES: DowntimeCategory[] = [
  "MECHANICAL", "ELECTRICAL", "MATERIAL_SHORTAGE", "OPERATOR_ISSUE", "MAINTENANCE", "POWER_FAILURE", "PRODUCTION_CHANGEOVER", "OTHER",
];

export interface DowntimeRecord {
  id: string;
  machine: { id: string; name: string; machineCode: string };
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  category: DowntimeCategory;
  reason: string | null;
  notes: string | null;
}

export interface CreateDowntimeInput {
  machineId: string;
  departmentId?: string;
  operatorId?: string;
  startTime: string;
  category: DowntimeCategory;
  reason?: string;
  notes?: string;
}

export function listDowntime(params: { page: number; machineId?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.machineId) qs.set("machineId", params.machineId);
  return api.get<DowntimeRecord[]>(`/downtime?${qs}`) as Promise<{ data: DowntimeRecord[]; meta: PaginatedMeta }>;
}

export function createDowntime(input: CreateDowntimeInput) {
  return api.post<DowntimeRecord>("/downtime", input);
}

export function closeDowntime(id: string, endTime: string) {
  return api.patch<DowntimeRecord>(`/downtime/${id}/close`, { endTime });
}
