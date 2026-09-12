import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "LEAVE";
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE"];

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  overtimeMinutes: number | null;
  notes: string | null;
}

export interface MarkAttendanceInput {
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  overtimeMinutes?: number;
  notes?: string;
}

export function listAttendance(params: { page: number; employeeId?: string; date?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.employeeId) qs.set("employeeId", params.employeeId);
  if (params.date) qs.set("date", params.date);
  return api.get<AttendanceRecord[]>(`/attendance?${qs}`) as Promise<{ data: AttendanceRecord[]; meta: PaginatedMeta }>;
}

export function markAttendance(input: MarkAttendanceInput) {
  return api.post<AttendanceRecord>("/attendance", input);
}
