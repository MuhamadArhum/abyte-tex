"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useEmployees } from "@/features/employees/hooks";
import { useAttendance, useMarkAttendance } from "@/features/attendance/hooks";
import { ATTENDANCE_STATUSES, type AttendanceRecord, type AttendanceStatus } from "@/features/attendance/api";
import { Loader2, Plus } from "lucide-react";

export default function AttendancePage() {
  return (
    <PermissionGate resource={Resource.ATTENDANCE} action={Action.VIEW}>
      <AttendancePageContent />
    </PermissionGate>
  );
}

function AttendancePageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAttendance(page);
  const [sheetOpen, setSheetOpen] = useState(false);

  const columns: Column<AttendanceRecord>[] = [
    { header: "Employee", cell: (a) => `${a.employee.firstName} ${a.employee.lastName} (${a.employee.employeeCode})` },
    { header: "Date", cell: (a) => new Date(a.date).toLocaleDateString() },
    { header: "Check in", cell: (a) => (a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : "—") },
    { header: "Check out", cell: (a) => (a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : "—") },
    { header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
    { header: "OT (min)", cell: (a) => a.overtimeMinutes ?? 0 },
  ];

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Daily attendance and overtime tracking (SRS §10.2)"
        actions={can(Resource.ATTENDANCE, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> Mark Attendance</Button> : undefined}
      />

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} rowKey={(a) => a.id} emptyMessage="No attendance records yet." />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>Mark Attendance</SheetTitle></SheetHeader>
          <MarkAttendanceForm onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MarkAttendanceForm({ onDone }: { onDone: () => void }) {
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<AttendanceStatus>("PRESENT");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [overtimeMinutes, setOvertimeMinutes] = useState("");
  const [notes, setNotes] = useState("");

  const { data: employees } = useEmployees(1, "");
  const mutation = useMarkAttendance();

  const canSubmit = employeeId && date && status;

  function handleSubmit() {
    if (!canSubmit) return;
    mutation.mutate(
      {
        employeeId,
        date: new Date(date).toISOString(),
        status,
        checkIn: checkIn ? new Date(`${date}T${checkIn}`).toISOString() : undefined,
        checkOut: checkOut ? new Date(`${date}T${checkOut}`).toISOString() : undefined,
        overtimeMinutes: overtimeMinutes ? Number(overtimeMinutes) : undefined,
        notes: notes || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Employee *</Label>
          <Select value={employeeId || undefined} onValueChange={(v) => setEmployeeId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select employee">{(() => { const e = employees?.data.find((emp) => emp.id === employeeId); return e ? `${e.firstName} ${e.lastName} (${e.employeeCode})` : undefined; })()}</SelectValue></SelectTrigger>
            <SelectContent>{employees?.data.map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Status *</Label>
            <Select value={status} onValueChange={(v) => setStatus((v as AttendanceStatus) ?? "PRESENT")}>
              <SelectTrigger className="w-full"><SelectValue>{status.replaceAll("_", " ")}</SelectValue></SelectTrigger>
              <SelectContent>{ATTENDANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Check in</Label><Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Check out</Label><Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Overtime (minutes)</Label><Input type="number" value={overtimeMinutes} onChange={(e) => setOvertimeMinutes(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || mutation.isPending} onClick={handleSubmit}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Mark attendance
        </Button>
      </div>
    </div>
  );
}
