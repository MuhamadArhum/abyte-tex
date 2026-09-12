"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useFactories, useWarehouses } from "@/features/factories/hooks";
import { useSalesOrders } from "@/features/sales/hooks";
import { useCreateDispatch, useDispatches } from "@/features/dispatch/hooks";
import type { Dispatch } from "@/features/dispatch/api";
import { Loader2, Plus } from "lucide-react";

export default function DispatchesPage() {
  return (
    <PermissionGate resource={Resource.DISPATCH} action={Action.VIEW}>
      <DispatchesPageContent />
    </PermissionGate>
  );
}

function DispatchesPageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDispatches(page);
  const [sheetOpen, setSheetOpen] = useState(false);

  const columns: Column<Dispatch>[] = [
    { header: "Dispatch #", cell: (d) => <span className="font-medium">{d.dispatchNumber}</span> },
    { header: "Sales Order", cell: (d) => d.salesOrder.orderNumber },
    { header: "Customer", cell: (d) => d.salesOrder.customer?.name ?? "—" },
    { header: "Vehicle", cell: (d) => d.vehicleNumber ?? "—" },
    { header: "Date", cell: (d) => new Date(d.dispatchDate).toLocaleDateString() },
    { header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Dispatches"
        description="Outbound shipments to customers (SRS §8.4)"
        actions={can(Resource.DISPATCH, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Dispatch</Button> : undefined}
      />

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} rowKey={(d) => d.id} emptyMessage="No dispatches yet." />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-4 sm:max-w-lg">
          <SheetHeader className="px-1"><SheetTitle>New Dispatch</SheetTitle></SheetHeader>
          <CreateDispatchForm onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CreateDispatchForm({ onDone }: { onDone: () => void }) {
  const [factoryId, setFactoryId] = useState("");
  const [salesOrderId, setSalesOrderId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const { data: factories } = useFactories(1, "");
  const { data: warehouses } = useWarehouses(factoryId);
  const { data: salesOrders } = useSalesOrders(1, "");
  const dispatchableOrders = (salesOrders?.data ?? []).filter((o) => !["DRAFT", "DISPATCHED", "COMPLETED", "CANCELLED"].includes(o.status));
  const selectedOrder = dispatchableOrders.find((o) => o.id === salesOrderId);

  const [rows, setRows] = useState<Record<string, { quantity: number; batchNumber: string }>>({});
  const createMutation = useCreateDispatch();

  function updateRow(itemId: string, patch: Partial<{ quantity: number; batchNumber: string }>) {
    setRows((prev) => ({ ...prev, [itemId]: { ...{ quantity: 0, batchNumber: "" }, ...prev[itemId], ...patch } }));
  }

  const activeItems = selectedOrder
    ? selectedOrder.items
        .filter((i) => Number(i.deliveredQty) < Number(i.quantity))
        .map((i) => ({ item: i, row: rows[i.id] ?? { quantity: 0, batchNumber: "" } }))
        .filter((r) => r.row.quantity > 0)
    : [];

  const canSubmit = factoryId && warehouseId && salesOrderId && activeItems.length > 0;

  function handleSubmit() {
    if (!canSubmit || !selectedOrder) return;
    createMutation.mutate(
      {
        factoryId,
        salesOrderId,
        warehouseId,
        vehicleNumber: vehicleNumber || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        deliveryAddress: deliveryAddress || undefined,
        items: activeItems.map(({ item, row }) => ({
          productId: item.productId,
          salesOrderItemId: item.id,
          quantity: row.quantity,
          unit: item.unit,
          batchNumber: row.batchNumber || undefined,
        })),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Factory *</Label>
          <Select value={factoryId} onValueChange={(v) => { setFactoryId(v ?? ""); setWarehouseId(""); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select factory" /></SelectTrigger>
            <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Warehouse *</Label>
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
            <SelectContent>{warehouses?.data.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Sales order *</Label>
          <Select value={salesOrderId} onValueChange={(v) => { setSalesOrderId(v ?? ""); setRows({}); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select sales order" /></SelectTrigger>
            <SelectContent>{dispatchableOrders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNumber} — {o.customer.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {selectedOrder && (
          <div className="space-y-2">
            <Label>Items to dispatch</Label>
            {selectedOrder.items.filter((i) => Number(i.deliveredQty) < Number(i.quantity)).map((item) => {
              const remaining = Number(item.quantity) - Number(item.deliveredQty);
              const row = rows[item.id] ?? { quantity: 0, batchNumber: "" };
              return (
                <div key={item.id} className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{item.product.name} <span className="text-muted-foreground">(remaining: {remaining} {item.unit})</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantity</Label>
                      <Input type="number" step="any" value={row.quantity} onChange={(e) => updateRow(item.id, { quantity: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Batch (optional)</Label>
                      <Input value={row.batchNumber} onChange={(e) => updateRow(item.id, { batchNumber: e.target.value })} />
                    </div>
                  </div>
                </div>
              );
            })}
            {selectedOrder.items.every((i) => Number(i.deliveredQty) >= Number(i.quantity)) && (
              <p className="text-sm text-muted-foreground">All items on this order have already been dispatched.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Vehicle number</Label><Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Driver name</Label><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Driver phone</Label><Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Delivery address</Label><Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} /></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || createMutation.isPending} onClick={handleSubmit}>
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create dispatch
        </Button>
      </div>
    </div>
  );
}
