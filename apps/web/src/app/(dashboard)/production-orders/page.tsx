"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useFactories } from "@/features/factories/hooks";
import { useProducts } from "@/features/products/hooks";
import { useCreateProductionOrder, useProductionOrders } from "@/features/production/hooks";
import type { CreateProductionOrderInput, ProductionOrder } from "@/features/production/api";
import { Loader2, Plus } from "lucide-react";

export default function ProductionOrdersPage() {
  return (
    <PermissionGate resource={Resource.PRODUCTION_ORDER} action={Action.VIEW}>
      <ProductionOrdersPageContent />
    </PermissionGate>
  );
}

function ProductionOrdersPageContent() {
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useProductionOrders(page);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: factories } = useFactories(1, "");
  const { data: products } = useProducts(1, "");
  const createMutation = useCreateProductionOrder();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CreateProductionOrderInput>();
  const factoryId = watch("factoryId");
  const productId = watch("productId");

  function onSubmit(values: CreateProductionOrderInput) {
    createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
  }

  const columns: Column<ProductionOrder>[] = [
    { header: "Order #", cell: (o) => <span className="font-medium">{o.orderNumber}</span> },
    { header: "Product", cell: (o) => o.product.name },
    { header: "Quantity", cell: (o) => `${o.quantity} ${o.unit}` },
    { header: "Priority", cell: (o) => o.priority },
    { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Production Orders"
        description="The core operational module (SRS §7.1–§7.4)"
        actions={can(Resource.PRODUCTION_ORDER, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Production Order</Button> : undefined}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/production-orders/${o.id}`)}
        emptyMessage="No production orders yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>New Production Order</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
            <div className="flex-1 space-y-4 px-1 pb-4">
              <div className="space-y-1.5">
                <Label>Factory *</Label>
                <Select value={factoryId || undefined} onValueChange={(v) => setValue("factoryId", v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select factory">{factories?.data.find((f) => f.id === factoryId)?.name}</SelectValue></SelectTrigger>
                  <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Product *</Label>
                <Select
                  value={productId || undefined}
                  onValueChange={(v) => {
                    const p = products?.data.find((pp) => pp.id === v);
                    setValue("productId", v ?? "");
                    if (p) setValue("unit", p.unit);
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select product">{products?.data.find((p) => p.id === productId)?.name}</SelectValue></SelectTrigger>
                  <SelectContent>{products?.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input id="quantity" type="number" step="any" {...register("quantity", { required: true, valueAsNumber: true })} />
                  {errors.quantity && <p className="text-xs text-destructive">Required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit">Unit *</Label>
                  <Input id="unit" {...register("unit", { required: true })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="submit" disabled={!factoryId || !productId || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create production order
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
