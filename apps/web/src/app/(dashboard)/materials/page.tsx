"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCreateMaterial, useMaterials, useUpdateMaterial } from "@/features/materials/hooks";
import { MaterialForm, type MaterialFormValues } from "@/features/materials/material-form";
import type { Material } from "@/features/materials/types";
import { Plus, Search } from "lucide-react";

function toFormDefaults(m: Material): Partial<MaterialFormValues> {
  return {
    code: m.code,
    name: m.name,
    type: m.type,
    unit: m.unit,
    reorderLevel: m.reorderLevel ? Number(m.reorderLevel) : undefined,
    status: m.status,
  };
}

export default function MaterialsPage() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useMaterials(page, debouncedSearch);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);

  const createMutation = useCreateMaterial();
  const updateMutation = useUpdateMaterial(editing?.id ?? "");

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function handleSubmit(values: MaterialFormValues) {
    if (editing) {
      const { code: _code, ...rest } = values;
      updateMutation.mutate(rest, { onSuccess: () => setSheetOpen(false) });
    } else {
      createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    }
  }

  const columns: Column<Material>[] = [
    { header: "Code", cell: (m) => <span className="font-medium">{m.code}</span> },
    { header: "Name", cell: (m) => m.name },
    { header: "Type", cell: (m) => <Badge variant="secondary">{m.type.replaceAll("_", " ")}</Badge> },
    { header: "Unit", cell: (m) => m.unit },
    { header: "Reorder level", cell: (m) => m.reorderLevel ?? "—" },
    { header: "Status", cell: (m) => <StatusBadge status={m.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Materials"
        description="Raw materials master data (SRS §5.4.2)"
        actions={
          can(Resource.MATERIAL, Action.CREATE) ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Material
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code or name…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(m) => m.id}
        onRowClick={
          can(Resource.MATERIAL, Action.UPDATE)
            ? (m) => {
                setEditing(m);
                setSheetOpen(true);
              }
            : undefined
        }
        emptyMessage="No materials yet. Add yarn, chemicals, dyes, or other raw materials."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{editing ? "Edit Material" : "Add Material"}</SheetTitle>
          </SheetHeader>
          <MaterialForm
            key={editing?.id ?? "new"}
            defaultValues={editing ? toFormDefaults(editing) : undefined}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            submitLabel={editing ? "Save changes" : "Create material"}
            isEdit={!!editing}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
