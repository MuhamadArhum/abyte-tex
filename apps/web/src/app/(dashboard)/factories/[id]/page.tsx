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

export default function FactoryDetailPage() {
  const params = useParams<{ id: string }>();
  const factoryId = params.id;
  const router = useRouter();
  const can = useAuthStore((s) => s.can);

  const { data: factory, isLoading } = useFactory(factoryId);
  const updateMutation = useUpdateFactory(factoryId);

  const [deptSheetOpen, setDeptSheetOpen] = useState(false);
  const [whSheetOpen, setWhSheetOpen] = useState(false);
  const [expandedWarehouse, setExpandedWarehouse] = useState<Warehouse | null>(null);

  const { data: departments, isLoading: deptLoading } = useDepartments(factoryId);
  const { data: warehouses, isLoading: whLoading } = useWarehouses(factoryId);
  const createDept = useCreateDepartment(factoryId);
  const createWh = useCreateWarehouse(factoryId);

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
