"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { useCreateFactory, useFactories } from "@/features/factories/hooks";
import { FactoryForm } from "@/features/factories/factory-form";
import type { CreateFactoryInput, Factory } from "@/features/factories/types";
import { Plus, Search } from "lucide-react";

export default function FactoriesPage() {
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useFactories(page, debouncedSearch);

  const [sheetOpen, setSheetOpen] = useState(false);
  const createMutation = useCreateFactory();

  function handleSubmit(values: CreateFactoryInput) {
    createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
  }

  const columns: Column<Factory>[] = [
    { header: "Code", cell: (f) => <span className="font-medium">{f.code}</span> },
    { header: "Name", cell: (f) => f.name },
    { header: "City", cell: (f) => f.city ?? "—" },
    { header: "Contact", cell: (f) => f.contactPhone ?? f.contactEmail ?? "—" },
    { header: "Status", cell: (f) => <StatusBadge status={f.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Factories"
        description="Manage your factories, departments, and warehouses (SRS §5.3)"
        actions={
          can(Resource.FACTORY, Action.CREATE) ? (
            <Button onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4" /> Add Factory
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
        rowKey={(f) => f.id}
        onRowClick={(f) => router.push(`/factories/${f.id}`)}
        emptyMessage="No factories yet. Add your first factory to configure departments and warehouses."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>Add Factory</SheetTitle>
          </SheetHeader>
          <FactoryForm onSubmit={handleSubmit} isSubmitting={createMutation.isPending} submitLabel="Create factory" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
