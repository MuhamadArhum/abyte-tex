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
import { useCreateProduct, useProducts, useUpdateProduct } from "@/features/products/hooks";
import { ProductForm, type ProductFormValues } from "@/features/products/product-form";
import type { Product } from "@/features/products/types";
import { nullsToUndefined } from "@/lib/utils";
import { Plus, Search } from "lucide-react";

export default function ProductsPage() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useProducts(page, debouncedSearch);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct(editing?.id ?? "");

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setSheetOpen(true);
  }

  function handleSubmit(values: ProductFormValues) {
    if (editing) {
      updateMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    } else {
      createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    }
  }

  const columns: Column<Product>[] = [
    { header: "SKU", cell: (p) => <span className="font-medium">{p.sku}</span> },
    { header: "Name", cell: (p) => p.name },
    { header: "Category", cell: (p) => p.category?.name ?? "—" },
    { header: "Unit", cell: (p) => p.unit },
    { header: "GSM", cell: (p) => p.gsm ?? "—" },
    { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        description="Finished goods master data (SRS §5.4.1)"
        actions={
          can(Resource.PRODUCT, Action.CREATE) ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU, name, or brand…"
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
        rowKey={(p) => p.id}
        onRowClick={can(Resource.PRODUCT, Action.UPDATE) ? openEdit : undefined}
        emptyMessage="No products yet. Add your first product to get started."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{editing ? "Edit Product" : "Add Product"}</SheetTitle>
          </SheetHeader>
          <ProductForm
            key={editing?.id ?? "new"}
            defaultValues={editing ? nullsToUndefined(editing) : undefined}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            submitLabel={editing ? "Save changes" : "Create product"}
            showStatus={!!editing}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
