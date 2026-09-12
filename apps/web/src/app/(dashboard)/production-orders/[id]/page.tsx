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
import {
  useCreateBatch,
  useProductionOrder,
  useRecordBatchOutput,
  useRecordConsumption,
  useUpdateProductionOrderStatus,
} from "@/features/production/hooks";
import { PRODUCTION_ORDER_STATUSES, type ProductionBatch, type ProductionOrderStatus } from "@/features/production/api";
import { useMaterials } from "@/features/materials/hooks";
import { useWarehouses } from "@/features/factories/hooks";
import { ArrowLeft, ChevronDown, Loader2, Plus } from "lucide-react";

export default function ProductionOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const { data, isLoading } = useProductionOrder(params.id);
  const statusMutation = useUpdateProductionOrderStatus(params.id);
  const createBatchMutation = useCreateBatch(params.id);

  const [consumeOpen, setConsumeOpen] = useState(false);
  const [outputBatch, setOutputBatch] = useState<ProductionBatch | null>(null);
  const [newBatchQty, setNewBatchQty] = useState(0);
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);

  if (isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data?.data) return <p className="text-sm text-muted-foreground">Production order not found.</p>;

  const o = data.data;
  const factoryId = o.factory?.id;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push("/production-orders")}>
        <ArrowLeft className="h-4 w-4" /> Back to Production Orders
      </Button>
      <PageHeader
        title={o.orderNumber}
        description={`${o.product.name} — ${o.quantity} ${o.unit}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={o.status} />
            {can(Resource.PRODUCTION_ORDER, Action.UPDATE) && (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Change status <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {PRODUCTION_ORDER_STATUSES.filter((s) => s !== o.status).map((s: ProductionOrderStatus) => (
                    <DropdownMenuItem key={s} onClick={() => statusMutation.mutate(s)}>{s.replaceAll("_", " ")}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Batches</CardTitle>
            {can(Resource.PRODUCTION_BATCH, Action.CREATE) && (
              <Button size="sm" variant="outline" onClick={() => setBatchSheetOpen(true)}><Plus className="h-3.5 w-3.5" /> Start Batch</Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {(o.batches ?? []).length === 0 && <p className="text-sm text-muted-foreground">No batches started yet.</p>}
            {(o.batches ?? []).map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <p className="font-medium">{b.batchNumber}</p>
                  <p className="text-xs text-muted-foreground">Input: {b.inputQuantity} · Output: {b.outputQuantity} · Wastage: {b.wastage}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.status === "IN_PROGRESS" && can(Resource.PRODUCTION_BATCH, Action.UPDATE) && (
                    <Button size="sm" variant="outline" onClick={() => setOutputBatch(b)}>Record Output</Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Material Consumption</CardTitle>
            {can(Resource.PRODUCTION_ORDER, Action.CREATE) && (
              <Button size="sm" variant="outline" onClick={() => setConsumeOpen(true)}><Plus className="h-3.5 w-3.5" /> Consume Material</Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Quantity</TableHead></TableRow></TableHeader>
              <TableBody>
                {(o.materialConsumptions ?? []).map((c) => (
                  <TableRow key={c.id}><TableCell>{c.material.name} ({c.material.code})</TableCell><TableCell>{c.quantity} {c.unit}</TableCell></TableRow>
                ))}
                {(o.materialConsumptions ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground">No material consumed yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Start batch */}
      <Sheet open={batchSheetOpen} onOpenChange={setBatchSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-sm">
          <SheetHeader className="px-1"><SheetTitle>Start Batch</SheetTitle></SheetHeader>
          <div className="flex-1 space-y-4 px-1 pb-4">
            <div className="space-y-1.5">
              <Label>Input quantity *</Label>
              <Input type="number" step="any" value={newBatchQty} onChange={(e) => setNewBatchQty(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              disabled={newBatchQty <= 0 || createBatchMutation.isPending}
              onClick={() => createBatchMutation.mutate(newBatchQty, { onSuccess: () => { setBatchSheetOpen(false); setNewBatchQty(0); } })}
            >
              {createBatchMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Start batch
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Record output */}
      <Sheet open={!!outputBatch} onOpenChange={(open) => !open && setOutputBatch(null)}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-sm">
          <SheetHeader className="px-1"><SheetTitle>Record Output — {outputBatch?.batchNumber}</SheetTitle></SheetHeader>
          {outputBatch && (
            <RecordOutputForm orderId={o.id} batch={outputBatch} factoryId={factoryId} onDone={() => setOutputBatch(null)} />
          )}
        </SheetContent>
      </Sheet>

      {/* Consume material */}
      <Sheet open={consumeOpen} onOpenChange={setConsumeOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-sm">
          <SheetHeader className="px-1"><SheetTitle>Consume Material</SheetTitle></SheetHeader>
          <ConsumeMaterialForm orderId={o.id} factoryId={factoryId} onDone={() => setConsumeOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RecordOutputForm({ orderId, batch, factoryId, onDone }: { orderId: string; batch: ProductionBatch; factoryId?: string; onDone: () => void }) {
  const { data: warehouses } = useWarehouses(factoryId ?? "");
  const [outputQuantity, setOutputQuantity] = useState(0);
  const [wastage, setWastage] = useState(0);
  const [warehouseId, setWarehouseId] = useState("");
  const mutation = useRecordBatchOutput(orderId);

  return (
    <>
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Output quantity *</Label><Input type="number" step="any" value={outputQuantity} onChange={(e) => setOutputQuantity(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Wastage</Label><Input type="number" step="any" value={wastage} onChange={(e) => setWastage(Number(e.target.value))} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Receive into warehouse (optional)</Label>
          <Select value={warehouseId || undefined} onValueChange={(v) => setWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Skip stock receipt">{warehouses?.data.find((w) => w.id === warehouseId)?.name}</SelectValue></SelectTrigger>
            <SelectContent>{warehouses?.data.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          disabled={outputQuantity <= 0 || mutation.isPending}
          onClick={() => mutation.mutate({ id: batch.id, outputQuantity, wastage, outputWarehouseId: warehouseId || undefined }, { onSuccess: onDone })}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Record output
        </Button>
      </div>
    </>
  );
}

function ConsumeMaterialForm({ orderId, factoryId, onDone }: { orderId: string; factoryId?: string; onDone: () => void }) {
  const { data: materials } = useMaterials(1, "");
  const { data: warehouses } = useWarehouses(factoryId ?? "");
  const [materialId, setMaterialId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState("");
  const mutation = useRecordConsumption(orderId);

  const canSubmit = materialId && warehouseId && quantity > 0 && unit;

  return (
    <>
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Material *</Label>
          <Select value={materialId || undefined} onValueChange={(v) => { const m = materials?.data.find((mm) => mm.id === v); setMaterialId(v ?? ""); if (m) setUnit(m.unit); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select material">{materials?.data.find((m) => m.id === materialId)?.name}</SelectValue></SelectTrigger>
            <SelectContent>{materials?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Warehouse *</Label>
          <Select value={warehouseId || undefined} onValueChange={(v) => setWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select warehouse">{warehouses?.data.find((w) => w.id === warehouseId)?.name}</SelectValue></SelectTrigger>
            <SelectContent>{warehouses?.data.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Unit *</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate({ materialId, warehouseId, quantity, unit }, { onSuccess: onDone })}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Record consumption
        </Button>
      </div>
    </>
  );
}
