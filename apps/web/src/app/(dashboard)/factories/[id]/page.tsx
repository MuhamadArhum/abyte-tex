"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type Column } from "@/components/shared/data-table";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import {
  useCreateDepartment,
  useCreateWarehouse,
  useDepartments,
  useFactory,
  useUpdateFactory,
  useWarehouses,
} from "@/features/factories/hooks";
import { FactoryForm } from "@/features/factories/factory-form";
import { DepartmentForm } from "@/features/factories/department-form";
import { WarehouseForm } from "@/features/factories/warehouse-form";
import { WarehouseLocationsPanel } from "@/features/factories/warehouse-locations-panel";
import type { CreateDepartmentInput, CreateWarehouseInput, Department, Warehouse } from "@/features/factories/types";
import { nullsToUndefined } from "@/lib/utils";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useCreateShift, useShifts } from "@/features/shifts/hooks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateShiftInput, Shift } from "@/features/shifts/api";

export default function FactoryDetailPage() {
  const params = useParams<{ id: string }>();
  const factoryId = params.id;
  const router = useRouter();
  const can = useAuthStore((s) => s.can);

  const { data: factory, isLoading } = useFactory(factoryId);
  const updateMutation = useUpdateFactory(factoryId);

  const [deptSheetOpen, setDeptSheetOpen] = useState(false);
  const [whSheetOpen, setWhSheetOpen] = useState(false);
  const [shiftSheetOpen, setShiftSheetOpen] = useState(false);
  const [expandedWarehouse, setExpandedWarehouse] = useState<Warehouse | null>(null);

  const { data: departments, isLoading: deptLoading } = useDepartments(factoryId);
  const { data: warehouses, isLoading: whLoading } = useWarehouses(factoryId);
  const { data: shifts, isLoading: shiftsLoading } = useShifts(factoryId);
  const createDept = useCreateDepartment(factoryId);
  const createWh = useCreateWarehouse(factoryId);
  const createShift = useCreateShift(factoryId);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!factory?.data) {
    return <p className="text-sm text-muted-foreground">Factory not found.</p>;
  }

  const f = factory.data;

  const deptColumns: Column<Department>[] = [
    { header: "Code", cell: (d) => <span className="font-medium">{d.code}</span> },
    { header: "Name", cell: (d) => d.name },
  ];

  const whColumns: Column<Warehouse>[] = [
    { header: "Code", cell: (w) => <span className="font-medium">{w.code}</span> },
    { header: "Name", cell: (w) => w.name },
    { header: "Type", cell: (w) => w.type.replaceAll("_", " ") },
  ];

  const shiftColumns: Column<Shift>[] = [
    { header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
    { header: "Start", cell: (s) => s.startTime },
    { header: "End", cell: (s) => s.endTime },
  ];

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push("/factories")}>
        <ArrowLeft className="h-4 w-4" /> Back to Factories
      </Button>
      <PageHeader
        title={f.name}
        description={`Code: ${f.code}${f.city ? ` · ${f.city}` : ""}`}
        actions={<StatusBadge status={f.status} />}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 max-w-lg">
          <Card>
            <CardContent className="pt-6">
              <FactoryForm
                defaultValues={nullsToUndefined(f)}
                isEdit
                submitLabel="Save changes"
                isSubmitting={updateMutation.isPending}
                onSubmit={(values) => {
                  const { code: _code, ...rest } = values;
                  updateMutation.mutate(rest);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="mt-4">
          <div className="mb-3 flex justify-end">
            {can(Resource.DEPARTMENT, Action.CREATE) && (
              <Button size="sm" onClick={() => setDeptSheetOpen(true)}>
                <Plus className="h-4 w-4" /> Add Department
              </Button>
            )}
          </div>
          <DataTable
            columns={deptColumns}
            data={departments?.data ?? []}
            isLoading={deptLoading}
            rowKey={(d) => d.id}
            emptyMessage="No departments yet."
          />
        </TabsContent>

        <TabsContent value="warehouses" className="mt-4">
          <div className="mb-3 flex justify-end">
            {can(Resource.WAREHOUSE, Action.CREATE) && (
              <Button size="sm" onClick={() => setWhSheetOpen(true)}>
                <Plus className="h-4 w-4" /> Add Warehouse
              </Button>
            )}
          </div>
          <DataTable
            columns={whColumns}
            data={warehouses?.data ?? []}
            isLoading={whLoading}
            rowKey={(w) => w.id}
            onRowClick={(w) => setExpandedWarehouse(w)}
            emptyMessage="No warehouses yet."
          />
        </TabsContent>

        <TabsContent value="shifts" className="mt-4">
          <div className="mb-3 flex justify-end">
            {can(Resource.SHIFT, Action.CREATE) && (
              <Button size="sm" onClick={() => setShiftSheetOpen(true)}>
                <Plus className="h-4 w-4" /> Add Shift
              </Button>
            )}
          </div>
          <DataTable
            columns={shiftColumns}
            data={shifts?.data ?? []}
            isLoading={shiftsLoading}
            rowKey={(s) => s.id}
            emptyMessage="No shifts yet."
          />
        </TabsContent>
      </Tabs>

      <Sheet open={deptSheetOpen} onOpenChange={setDeptSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>Add Department</SheetTitle>
          </SheetHeader>
          <DepartmentForm
            isSubmitting={createDept.isPending}
            submitLabel="Create department"
            onSubmit={(values: CreateDepartmentInput) => createDept.mutate(values, { onSuccess: () => setDeptSheetOpen(false) })}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={whSheetOpen} onOpenChange={setWhSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>Add Warehouse</SheetTitle>
          </SheetHeader>
          <WarehouseForm
            isSubmitting={createWh.isPending}
            submitLabel="Create warehouse"
            onSubmit={(values: CreateWarehouseInput) => createWh.mutate(values, { onSuccess: () => setWhSheetOpen(false) })}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={shiftSheetOpen} onOpenChange={setShiftSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>Add Shift</SheetTitle>
          </SheetHeader>
          <ShiftForm
            isSubmitting={createShift.isPending}
            onSubmit={(values) => createShift.mutate(values, { onSuccess: () => setShiftSheetOpen(false) })}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!expandedWarehouse} onOpenChange={(open) => !open && setExpandedWarehouse(null)}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{expandedWarehouse?.name} — Locations</SheetTitle>
          </SheetHeader>
          {expandedWarehouse && (
            <WarehouseLocationsPanel factoryId={factoryId} warehouseId={expandedWarehouse.id} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ShiftForm({ onSubmit, isSubmitting }: { onSubmit: (values: CreateShiftInput) => void; isSubmitting?: boolean }) {
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");

  const canSubmit = name.trim() && startTime && endTime;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="shift-name">Name *</Label>
          <Input id="shift-name" placeholder="Morning Shift" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="shift-start">Start time *</Label>
            <Input id="shift-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-end">End time *</Label>
            <Input id="shift-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          disabled={!canSubmit || isSubmitting}
          onClick={() => canSubmit && onSubmit({ name: name.trim(), startTime, endTime })}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create shift
        </Button>
      </div>
    </div>
  );
}
