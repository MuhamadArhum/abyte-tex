"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useFactories } from "@/features/factories/hooks";
import { useMachines } from "@/features/machines/hooks";
import { useCreateMaintenanceJob, useMaintenanceJobs, useUpdateMaintenanceJob } from "@/features/maintenance/hooks";
import { MAINTENANCE_JOB_STATUSES, type MaintenanceJob } from "@/features/maintenance/api";
import { ChevronDown, Loader2, Plus } from "lucide-react";

export default function MaintenancePage() {
  return (
    <PermissionGate resource={Resource.MAINTENANCE_JOB} action={Action.VIEW}>
      <MaintenancePageContent />
    </PermissionGate>
  );
}

function MaintenancePageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMaintenanceJobs(page);
  const [sheetOpen, setSheetOpen] = useState(false);
  const updateMutation = useUpdateMaintenanceJob();

  const columns: Column<MaintenanceJob>[] = [
    { header: "Machine", cell: (j) => `${j.machine.name} (${j.machine.machineCode})` },
    { header: "Type", cell: (j) => j.jobType },
    { header: "Scheduled", cell: (j) => (j.scheduledDate ? new Date(j.scheduledDate).toLocaleDateString() : "—") },
    { header: "Status", cell: (j) => <StatusBadge status={j.status} /> },
    {
      header: "Actions",
      cell: (j) =>
        can(Resource.MAINTENANCE_JOB, Action.UPDATE) ? (
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} onClick={(e) => e.stopPropagation()}>
              Status <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {MAINTENANCE_JOB_STATUSES.filter((s) => s !== j.status).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() =>
                    updateMutation.mutate({
                      id: j.id,
                      status: s,
                      startedAt: s === "IN_PROGRESS" ? new Date().toISOString() : undefined,
                      completedAt: s === "COMPLETED" ? new Date().toISOString() : undefined,
                    })
                  }
                >
                  {s.replaceAll("_", " ")}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Preventive and corrective machine maintenance (SRS §9.3)"
        actions={can(Resource.MAINTENANCE_JOB, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Job</Button> : undefined}
      />

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} rowKey={(j) => j.id} emptyMessage="No maintenance jobs yet." />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>New Maintenance Job (Preventive)</SheetTitle></SheetHeader>
          <CreateJobForm onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CreateJobForm({ onDone }: { onDone: () => void }) {
  const [factoryId, setFactoryId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");
  const { data: factories } = useFactories(1, "");
  const { data: machines } = useMachines(1, "");
  const createMutation = useCreateMaintenanceJob();

  const canSubmit = factoryId && machineId;

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate(
      { factoryId, machineId, scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : undefined, notes: notes || undefined },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Factory *</Label>
          <Select value={factoryId} onValueChange={(v) => setFactoryId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select factory" /></SelectTrigger>
            <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Machine *</Label>
          <Select value={machineId} onValueChange={(v) => setMachineId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select machine" /></SelectTrigger>
            <SelectContent>{machines?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.machineCode})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Scheduled date</Label>
          <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </div>
        <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || createMutation.isPending} onClick={handleSubmit}>
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create job
        </Button>
      </div>
    </div>
  );
}
