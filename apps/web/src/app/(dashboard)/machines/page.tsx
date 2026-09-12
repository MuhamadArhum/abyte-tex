"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFactories } from "@/features/factories/hooks";
import { useCreateMachine, useMachines, useUpdateMachine } from "@/features/machines/hooks";
import type { CreateMachineInput, Machine, MachineStatus } from "@/features/machines/api";
import { Loader2, Plus, Search } from "lucide-react";

const STATUSES: MachineStatus[] = ["RUNNING", "IDLE", "BREAKDOWN", "MAINTENANCE", "OFFLINE"];

export default function MachinesPage() {
  return (
    <PermissionGate resource={Resource.MACHINE} action={Action.VIEW}>
      <MachinesPageContent />
    </PermissionGate>
  );
}

function MachinesPageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useMachines(page, debouncedSearch);
  const { data: factories } = useFactories(1, "");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [factoryId, setFactoryId] = useState<string>("");

  const createMutation = useCreateMachine(factoryId);
  const updateMutation = useUpdateMachine(editing?.id ?? "");

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateMachineInput & { status?: MachineStatus }>();
  const status = watch("status");

  function openCreate() {
    setEditing(null);
    reset({});
    setSheetOpen(true);
  }
  function openEdit(m: Machine) {
    setEditing(m);
    reset({ name: m.name, type: m.type, manufacturer: m.manufacturer ?? undefined, model: m.model ?? undefined, location: m.location ?? undefined, capacity: m.capacity ?? undefined, status: m.status });
    setSheetOpen(true);
  }

  function onSubmit(values: CreateMachineInput & { status?: MachineStatus }) {
    if (editing) {
      updateMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    } else {
      if (!factoryId) {
        return;
      }
      createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    }
  }

  const columns: Column<Machine>[] = [
    { header: "Code", cell: (m) => <span className="font-medium">{m.machineCode}</span> },
    { header: "Name", cell: (m) => m.name },
    { header: "Type", cell: (m) => m.type },
    { header: "Location", cell: (m) => m.location ?? "—" },
    { header: "Status", cell: (m) => <StatusBadge status={m.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Machines & Looms"
        description="Central machine registry (SRS §7.5)"
        actions={can(Resource.MACHINE, Action.CREATE) ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Machine</Button> : undefined}
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by code or name…" className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(m) => m.id}
        onRowClick={can(Resource.MACHINE, Action.UPDATE) ? openEdit : undefined}
        emptyMessage="No machines yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{editing ? "Edit Machine" : "Add Machine"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
              {!editing && (
                <div className="space-y-1.5">
                  <Label>Factory *</Label>
                  <Select value={factoryId} onValueChange={(v) => setFactoryId(v ?? "")}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select factory" /></SelectTrigger>
                    <SelectContent>
                      {factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="machineCode">Machine code *</Label>
                  <Input id="machineCode" disabled={!!editing} {...register("machineCode", { required: !editing })} />
                  {errors.machineCode && <p className="text-xs text-destructive">Required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="type">Type *</Label>
                  <Input id="type" placeholder="Loom, Dyeing…" {...register("type", { required: true })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" {...register("name", { required: true })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input id="manufacturer" {...register("manufacturer")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" {...register("model")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" {...register("location")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input id="capacity" {...register("capacity")} />
                </div>
              </div>
              {editing && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setValue("status", v as MachineStatus)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || (!editing && !factoryId)}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Create machine"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
