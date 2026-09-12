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
import { useCreateEmployee, useEmployees, useUpdateEmployee } from "@/features/employees/hooks";
import type { CreateEmployeeInput, Employee, EmploymentStatus } from "@/features/employees/api";
import { Loader2, Plus, Search } from "lucide-react";

const STATUSES: EmploymentStatus[] = ["ACTIVE", "INACTIVE", "TERMINATED", "ON_LEAVE"];

export default function EmployeesPage() {
  return (
    <PermissionGate resource={Resource.EMPLOYEE} action={Action.VIEW}>
      <EmployeesPageContent />
    </PermissionGate>
  );
}

function EmployeesPageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useEmployees(page, debouncedSearch);
  const { data: factories } = useFactories(1, "");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [factoryId, setFactoryId] = useState("");

  const createMutation = useCreateEmployee(factoryId);
  const updateMutation = useUpdateEmployee(editing?.id ?? "");
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateEmployeeInput & { employmentStatus?: EmploymentStatus }>();
  const status = watch("employmentStatus");

  function openCreate() {
    setEditing(null);
    reset({});
    setSheetOpen(true);
  }
  function openEdit(e: Employee) {
    setEditing(e);
    reset({ firstName: e.firstName, lastName: e.lastName, designation: e.designation ?? undefined, phone: e.phone ?? undefined, email: e.email ?? undefined, employmentStatus: e.employmentStatus });
    setSheetOpen(true);
  }

  function onSubmit(values: CreateEmployeeInput & { employmentStatus?: EmploymentStatus }) {
    if (editing) updateMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    else if (factoryId) createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
  }

  const columns: Column<Employee>[] = [
    { header: "Code", cell: (e) => <span className="font-medium">{e.employeeCode}</span> },
    { header: "Name", cell: (e) => `${e.firstName} ${e.lastName}` },
    { header: "Designation", cell: (e) => e.designation ?? "—" },
    { header: "Phone", cell: (e) => e.phone ?? "—" },
    { header: "Status", cell: (e) => <StatusBadge status={e.employmentStatus} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Core employee profiles (SRS §10.1)"
        actions={can(Resource.EMPLOYEE, Action.CREATE) ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Employee</Button> : undefined}
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or code…" className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(e) => e.id}
        onRowClick={can(Resource.EMPLOYEE, Action.UPDATE) ? openEdit : undefined}
        emptyMessage="No employees yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{editing ? "Edit Employee" : "Add Employee"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
              {!editing && (
                <div className="space-y-1.5">
                  <Label>Factory *</Label>
                  <Select value={factoryId || undefined} onValueChange={(v) => setFactoryId(v ?? "")}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select factory">{factories?.data.find((f) => f.id === factoryId)?.name}</SelectValue></SelectTrigger>
                    <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="employeeCode">Employee code *</Label>
                  <Input id="employeeCode" disabled={!!editing} {...register("employeeCode", { required: !editing })} />
                  {errors.employeeCode && <p className="text-xs text-destructive">Required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="designation">Designation</Label>
                  <Input id="designation" {...register("designation")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name *</Label>
                  <Input id="firstName" {...register("firstName", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name *</Label>
                  <Input id="lastName" {...register("lastName", { required: true })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" {...register("phone")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...register("email")} />
                </div>
              </div>
              {editing && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setValue("employmentStatus", v as EmploymentStatus)}>
                    <SelectTrigger className="w-full"><SelectValue>{status?.replaceAll("_", " ")}</SelectValue></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || (!editing && !factoryId)}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Create employee"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
