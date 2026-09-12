import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { listAttendance, markAttendance, type MarkAttendanceInput } from "./api";

export function useAttendance(page: number, employeeId?: string, date?: string) {
  return useQuery({ queryKey: ["attendance", page, employeeId, date], queryFn: () => listAttendance({ page, employeeId, date }) });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkAttendanceInput) => markAttendance(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Attendance marked");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to mark attendance"),
  });
}
