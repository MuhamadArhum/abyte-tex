"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { usePurchaseOrder, useUpdatePurchaseOrderStatus, useCreateGoodsReceipt } from "@/features/procurement/hooks";
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from "@/features/procurement/api";
import { useWarehouses } from "@/features/factories/hooks";
import { ArrowLeft, ChevronDown, Loader2, PackageCheck } from "lucide-react";

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const { data, isLoading } = usePurchaseOrder(params.id);
  const statusMutation = useUpdatePurchaseOrderStatus(params.id);
  const [receiveOpen, setReceiveOpen] = useState(false);

  if (isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data?.data) return <p className="text-sm text-muted-foreground">Purchase order not found.</p>;

  const o = data.data;
  const factoryId = o.factory?.id;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push("/purchase-orders")}>
        <ArrowLeft className="h-4 w-4" /> Back to Purchase Orders
      </Button>
      <PageHeader
        title={o.poNumber}
        description={`Supplier: ${o.supplier.name}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={o.status} />
            {can(Resource.PURCHASE_ORDER, Action.CREATE) && o.status !== "RECEIVED" && o.status !== "CANCELLED" && (
              <Button size="sm" onClick={() => setReceiveOpen(true)}><PackageCheck className="h-4 w-4" /> Receive Goods</Button>
            )}
            {can(Resource.PURCHASE_ORDER, Action.APPROVE) && (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Change status <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {PURCHASE_ORDER_STATUSES.filter((s) => s !== o.status).map((s: PurchaseOrderStatus) => (
                    <DropdownMenuItem key={s} onClick={() => statusMutation.mutate(s)}>{s.replaceAll("_", " ")}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-sm">Materials</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Rejected</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.material?.name} ({item.material?.code})</TableCell>
                  <TableCell>{item.quantity} {item.unit}</TableCell>
                  <TableCell>{item.receivedQty}</TableCell>
                  <TableCell>{item.rejectedQty}</TableCell>
                  <TableCell>{Number(item.unitPrice).toLocaleString()}</TableCell>
                  <TableCell>{Number(item.lineTotal).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={receiveOpen} onOpenChange={setReceiveOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-4 sm:max-w-lg">
          <SheetHeader className="px-1">
            <SheetTitle>Receive Goods — {o.poNumber}</SheetTitle>
          </SheetHeader>
          <GoodsReceiptForm purchaseOrderId={o.id} items={o.items} factoryId={factoryId} onDone={() => setReceiveOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GoodsReceiptForm({
  purchaseOrderId,
  items,
  factoryId,
  onDone,
}: {
  purchaseOrderId: string;
  items: Array<{ id: string; material: { name: string; code: string } | null; quantity: string; receivedQty: string }>;
  factoryId?: string;
  onDone: () => void;
}) {
  const { data: warehouses } = useWarehouses(factoryId ?? "");
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState(() =>
    items
      .filter((i) => Number(i.receivedQty) < Number(i.quantity))
      .map((i) => ({ purchaseOrderItemId: i.id, label: `${i.material?.name} (${i.material?.code})`, remaining: Number(i.quantity) - Number(i.receivedQty), receivedQty: 0, acceptedQty: 0, rejectedQty: 0 })),
  );
  const createMutation = useCreateGoodsReceipt();

  function updateRow(id: string, patch: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r) => (r.purchaseOrderItemId === id ? { ...r, ...patch } : r)));
  }

  const activeRows = rows.filter((r) => r.receivedQty > 0);
  const canSubmit = warehouseId && activeRows.length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate(
      { purchaseOrderId, warehouseId, items: activeRows.map((r) => ({ purchaseOrderItemId: r.purchaseOrderItemId, receivedQty: r.receivedQty, acceptedQty: r.acceptedQty, rejectedQty: r.rejectedQty })) },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Warehouse *</Label>
          <Select value={warehouseId || undefined} onValueChange={(v) => setWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select warehouse">{warehouses?.data.find((w) => w.id === warehouseId)?.name}</SelectValue></SelectTrigger>
            <SelectContent>{warehouses?.data.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">All items on this order have already been fully received.</p>}
        {rows.map((row) => (
          <div key={row.purchaseOrderItemId} className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{row.label} <span className="text-muted-foreground">(remaining: {row.remaining})</span></p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Received</Label>
                <Input type="number" step="any" value={row.receivedQty} onChange={(e) => updateRow(row.purchaseOrderItemId, { receivedQty: Number(e.target.value), acceptedQty: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Accepted</Label>
                <Input type="number" step="any" value={row.acceptedQty} onChange={(e) => updateRow(row.purchaseOrderItemId, { acceptedQty: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rejected</Label>
                <Input type="number" step="any" value={row.rejectedQty} onChange={(e) => updateRow(row.purchaseOrderItemId, { rejectedQty: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" disabled={!canSubmit || createMutation.isPending} onClick={handleSubmit}>
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Record receipt
        </Button>
      </div>
    </div>
  );
}
