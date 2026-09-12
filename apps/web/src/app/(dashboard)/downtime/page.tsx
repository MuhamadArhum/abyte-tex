"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useMachines } from "@/features/machines/hooks";
import { useCloseDowntime, useCreateDowntime, useDowntimeRecords } from "@/features/downtime/hooks";
import { DOWNTIME_CATEGORIES, type DowntimeCategory, type DowntimeRecord } from "@/features/downtime/api";
import { Loader2, Plus, Square } from "lucide-react";

export default function DowntimePage() {
  return (
    <PermissionGate resource={Resource.DOWNTIME} action={Action.VIEW}>
      <DowntimePageContent />
    </PermissionGate>
  );
}

function DowntimePageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDowntimeRecords(page);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeMutation = useCloseDowntime();

  const columns: Column<DowntimeRecord>[] = [
    { header: "Machine", cell: (d) => `${d.machine.name} (${d.machine.machineCode})` },
    { header: "Category", cell: (d) => d.category.replaceAll("_", " ") },
    { header: "Start", cell: (d) => new Date(d.startTime).toLocaleString() },
    { header: "Duration", cell: (d) => (d.durationMinutes != null ? `${d.durationMinutes} min` : "Ongoing") },
    { header: "Reason", cell: (d) => d.reason ?? "—" },
    {
      header: "Actions",
      cell: (d) =>
        !d.endTime && can(Resource.DOWNTIME, Action.UPDATE) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); closeMutation.mutate({ id: d.id, endTime: new Date().toISOString() }); }}
          >
            <Square className="h-3.5 w-3.5" /> Close
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Downtime"
        description="Machine downtime logging — mechanical/electrical breakdowns auto-create a maintenance job (SRS §7.7)"
        actions={can(Resource.DOWNTIME, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> Log Downtime</Button> : undefined}
      />

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} rowKey={(d) => d.id} emptyMessage="No downtime recorded yet." />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>Log Downtime</SheetTitle></SheetHeader>
          <CreateDowntimeForm onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CreateDowntimeForm({ onDone }: { onDone: () => void }) {
  const [machineId, setMachineId] = useState("");
  const [category, setCategory] = useState<DowntimeCategory>("MECHANICAL");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const { data: machines } = useMachines(1, "");
  const mutation = useCreateDowntime();

  const canSubmit = machineId && category;

  function handleSubmit() {
    if (!canSubmit) return;
    mutation.mutate(
      { machineId, category, startTime: new Date().toISOString(), reason: reason || undefined, notes: notes || undefined },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Machine *</Label>
          <Select value={machineId || undefined} onValueChange={(v) => setMachineId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select machine">{machines?.data.find((m) => m.id === machineId)?.name}</SelectValue></SelectTrigger>
            <SelectContent>{machines?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.machineCode})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Category *</Label>
          <Select value={category} onValueChange={(v) => setCategory((v as DowntimeCategory) ?? "MECHANICAL")}>
            <SelectTrigger className="w-full"><SelectValue>{category.replaceAll("_", " ")}</SelectValue></SelectTrigger>
            <SelectContent>{DOWNTIME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
          {(category === "MECHANICAL" || category === "ELECTRICAL") && (
            <p className="text-xs text-muted-foreground">This will set the machine to BREAKDOWN and auto-create a corrective maintenance job.</p>
          )}
        </div>
        <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || mutation.isPending} onClick={handleSubmit}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Log downtime
        </Button>
      </div>
    </div>
  );
}
