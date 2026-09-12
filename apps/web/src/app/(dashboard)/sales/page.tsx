"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCreateSalesOrder, useSalesOrders } from "@/features/sales/hooks";
import { SalesOrderForm } from "@/features/sales/sales-order-form";
import type { SalesOrder } from "@/features/sales/api";
import { Plus, Search } from "lucide-react";

export default function SalesOrdersPage() {
  return (
    <PermissionGate resource={Resource.SALES_ORDER} action={Action.VIEW}>
      <SalesOrdersPageContent />
    </PermissionGate>
  );
}

function SalesOrdersPageContent() {
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useSalesOrders(page, debouncedSearch);
  const [sheetOpen, setSheetOpen] = useState(false);
  const createMutation = useCreateSalesOrder();

  const columns: Column<SalesOrder>[] = [
    { header: "Order #", cell: (o) => <span className="font-medium">{o.orderNumber}</span> },
    { header: "Customer", cell: (o) => o.customer.name },
    { header: "Total", cell: (o) => Number(o.total).toLocaleString() },
    { header: "Delivery date", cell: (o) => (o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString() : "—") },
    { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        description="Customer orders from quotation through dispatch (SRS §6.1)"
        actions={can(Resource.SALES_ORDER, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Sales Order</Button> : undefined}
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by order # or customer…" className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/sales/${o.id}`)}
        emptyMessage="No sales orders yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-4 sm:max-w-xl">
          <SheetHeader className="px-1">
            <SheetTitle>New Sales Order</SheetTitle>
          </SheetHeader>
          <SalesOrderForm
            isSubmitting={createMutation.isPending}
            onSubmit={(values) => createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) })}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
