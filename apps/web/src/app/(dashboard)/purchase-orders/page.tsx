"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useCreatePurchaseOrder, usePurchaseOrders } from "@/features/procurement/hooks";
import { PurchaseOrderForm } from "@/features/procurement/purchase-order-form";
import type { PurchaseOrder } from "@/features/procurement/api";
import { Plus } from "lucide-react";

export default function PurchaseOrdersPage() {
  return (
    <PermissionGate resource={Resource.PURCHASE_ORDER} action={Action.VIEW}>
      <PurchaseOrdersPageContent />
    </PermissionGate>
  );
}

function PurchaseOrdersPageContent() {
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePurchaseOrders(page);
  const [sheetOpen, setSheetOpen] = useState(false);
  const createMutation = useCreatePurchaseOrder();

  const columns: Column<PurchaseOrder>[] = [
    { header: "PO #", cell: (o) => <span className="font-medium">{o.poNumber}</span> },
    { header: "Supplier", cell: (o) => o.supplier.name },
    { header: "Total", cell: (o) => Number(o.total).toLocaleString() },
    { header: "Expected date", cell: (o) => (o.expectedDate ? new Date(o.expectedDate).toLocaleDateString() : "—") },
    { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Procurement workflow: request → approval → order → receipt (SRS §6.2)"
        actions={can(Resource.PURCHASE_ORDER, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Purchase Order</Button> : undefined}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/purchase-orders/${o.id}`)}
        emptyMessage="No purchase orders yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-4 sm:max-w-xl">
          <SheetHeader className="px-1">
            <SheetTitle>New Purchase Order</SheetTitle>
          </SheetHeader>
          <PurchaseOrderForm isSubmitting={createMutation.isPending} onSubmit={(values) => createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) })} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
