"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCreateSupplier, useSuppliers, useUpdateSupplier } from "@/features/suppliers/hooks";
import { SupplierForm, type SupplierFormValues } from "@/features/suppliers/supplier-form";
import type { Supplier } from "@/features/suppliers/types";
import { Plus, Search, Star } from "lucide-react";

function toFormDefaults(s: Supplier): Partial<SupplierFormValues> {
  return {
    name: s.name,
    contactPerson: s.contactPerson ?? undefined,
    phone: s.phone ?? undefined,
    email: s.email ?? undefined,
    address: s.address ?? undefined,
    paymentTerms: s.paymentTerms ?? undefined,
    rating: s.rating ?? undefined,
    status: s.status,
  };
}

export default function SuppliersPage() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useSuppliers(page, debouncedSearch);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier(editing?.id ?? "");

  function handleSubmit(values: SupplierFormValues) {
    if (editing) {
      updateMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    } else {
      createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    }
  }

  const columns: Column<Supplier>[] = [
    { header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
    { header: "Contact person", cell: (s) => s.contactPerson ?? "—" },
    { header: "Phone", cell: (s) => s.phone ?? "—" },
    {
      header: "Rating",
      cell: (s) =>
        s.rating ? (
          <span className="flex items-center gap-0.5">
            {s.rating} <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          </span>
        ) : (
          "—"
        ),
    },
    { header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Supplier master data (SRS §5.4.4)"
        actions={
          can(Resource.SUPPLIER, Action.CREATE) ? (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Supplier
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, contact, or phone…"
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
        rowKey={(s) => s.id}
        onRowClick={
          can(Resource.SUPPLIER, Action.UPDATE)
            ? (s) => {
                setEditing(s);
                setSheetOpen(true);
              }
            : undefined
        }
        emptyMessage="No suppliers yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{editing ? "Edit Supplier" : "Add Supplier"}</SheetTitle>
          </SheetHeader>
          <SupplierForm
            key={editing?.id ?? "new"}
            defaultValues={editing ? toFormDefaults(editing) : undefined}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            submitLabel={editing ? "Save changes" : "Create supplier"}
            isEdit={!!editing}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
