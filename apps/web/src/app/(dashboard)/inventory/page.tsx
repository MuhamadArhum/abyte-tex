"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useFactories, useWarehouses } from "@/features/factories/hooks";
import { useProducts } from "@/features/products/hooks";
import { useMaterials } from "@/features/materials/hooks";
import { useRecordMovement, useStockLevels, useStockMovements, useTransferStock } from "@/features/inventory/hooks";
import { MANUAL_MOVEMENT_TYPES, type ManualMovementType, type StockMovementRow, type StockRow } from "@/features/inventory/api";
import { ArrowLeftRight, Loader2, Plus } from "lucide-react";

export default function InventoryPage() {
  return (
    <PermissionGate resource={Resource.STOCK} action={Action.VIEW}>
      <InventoryPageContent />
    </PermissionGate>
  );
}

function InventoryPageContent() {
  const can = useAuthStore((s) => s.can);
  const [factoryId, setFactoryId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [stockPage, setStockPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [movementSheetOpen, setMovementSheetOpen] = useState(false);
  const [transferSheetOpen, setTransferSheetOpen] = useState(false);

  const { data: factories } = useFactories(1, "");
  const { data: warehouses } = useWarehouses(factoryId);
  const { data: stock, isLoading: stockLoading } = useStockLevels(stockPage, warehouseId || undefined);
  const { data: movements, isLoading: movementsLoading } = useStockMovements(movementPage, warehouseId || undefined);

  const stockColumns: Column<StockRow>[] = [
    { header: "Warehouse", cell: (s) => s.warehouse.name },
    { header: "Item", cell: (s) => (s.product ? `${s.product.name} (${s.product.sku})` : s.material ? `${s.material.name} (${s.material.code})` : "—") },
    { header: "Batch", cell: (s) => s.batchNumber ?? "—" },
    { header: "Quantity", cell: (s) => `${s.quantity} ${s.unit}` },
  ];

  const movementColumns: Column<StockMovementRow>[] = [
    { header: "Date", cell: (m) => new Date(m.createdAt).toLocaleString() },
    { header: "Warehouse", cell: (m) => m.warehouse.name },
    { header: "Item", cell: (m) => (m.product ? m.product.name : m.material ? m.material.name : "—") },
    { header: "Type", cell: (m) => m.type.replaceAll("_", " ") },
    { header: "Qty", cell: (m) => <span className={Number(m.quantity) < 0 ? "text-destructive" : "text-emerald-600"}>{Number(m.quantity) > 0 ? "+" : ""}{m.quantity} {m.unit}</span> },
    { header: "Notes", cell: (m) => m.notes ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels and movement ledger (SRS §8)"
        actions={
          can(Resource.STOCK, Action.CREATE) ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTransferSheetOpen(true)}><ArrowLeftRight className="h-4 w-4" /> Transfer</Button>
              <Button onClick={() => setMovementSheetOpen(true)}><Plus className="h-4 w-4" /> Record Movement</Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="space-y-1.5">
          <Label>Factory</Label>
          <Select value={factoryId} onValueChange={(v) => { setFactoryId(v ?? ""); setWarehouseId(""); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="All factories" /></SelectTrigger>
            <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Warehouse</Label>
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="All warehouses" /></SelectTrigger>
            <SelectContent>{warehouses?.data.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="movements">Movement Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="stock" className="pt-4">
          <DataTable columns={stockColumns} data={stock?.data ?? []} isLoading={stockLoading} rowKey={(s) => s.id} emptyMessage="No stock records yet." />
          <PaginationBar meta={stock?.meta} onPageChange={setStockPage} />
        </TabsContent>
        <TabsContent value="movements" className="pt-4">
          <DataTable columns={movementColumns} data={movements?.data ?? []} isLoading={movementsLoading} rowKey={(m) => m.id} emptyMessage="No movements recorded yet." />
          <PaginationBar meta={movements?.meta} onPageChange={setMovementPage} />
        </TabsContent>
      </Tabs>

      <Sheet open={movementSheetOpen} onOpenChange={setMovementSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>Record Stock Movement</SheetTitle></SheetHeader>
          <RecordMovementForm onDone={() => setMovementSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={transferSheetOpen} onOpenChange={setTransferSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>Transfer Stock</SheetTitle></SheetHeader>
          <TransferStockForm onDone={() => setTransferSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RecordMovementForm({ onDone }: { onDone: () => void }) {
  const [factoryId, setFactoryId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [itemKind, setItemKind] = useState<"product" | "material">("material");
  const [productId, setProductId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [type, setType] = useState<ManualMovementType>("RECEIVE");
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [notes, setNotes] = useState("");

  const { data: factories } = useFactories(1, "");
  const { data: warehouses } = useWarehouses(factoryId);
  const { data: products } = useProducts(1, "");
  const { data: materials } = useMaterials(1, "");
  const mutation = useRecordMovement();

  const canSubmit = warehouseId && quantity > 0 && unit && (itemKind === "product" ? productId : materialId);

  function handleSubmit() {
    if (!canSubmit) return;
    mutation.mutate(
      {
        warehouseId,
        productId: itemKind === "product" ? productId : undefined,
        materialId: itemKind === "material" ? materialId : undefined,
        batchNumber: batchNumber || undefined,
        type,
        quantity,
        unit,
        decrease: type === "ADJUSTMENT" ? true : undefined,
        notes: notes || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Movement type *</Label>
          <Select value={type} onValueChange={(v) => setType((v as ManualMovementType) ?? "RECEIVE")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{MANUAL_MOVEMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
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
          <Label>Item type *</Label>
          <Select value={itemKind} onValueChange={(v) => setItemKind((v as "product" | "material") ?? "material")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="material">Raw material</SelectItem>
              <SelectItem value="product">Finished product</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {itemKind === "material" ? (
          <div className="space-y-1.5">
            <Label>Material *</Label>
            <Select value={materialId} onValueChange={(v) => { const m = materials?.data.find((mm) => mm.id === v); setMaterialId(v ?? ""); if (m) setUnit(m.unit); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select material" /></SelectTrigger>
              <SelectContent>{materials?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={productId} onValueChange={(v) => { const p = products?.data.find((pp) => pp.id === v); setProductId(v ?? ""); if (p) setUnit(p.unit); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>{products?.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Unit *</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Batch number (optional)</Label><Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || mutation.isPending} onClick={handleSubmit}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Record movement
        </Button>
      </div>
    </div>
  );
}

function TransferStockForm({ onDone }: { onDone: () => void }) {
  const [factoryId, setFactoryId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [itemKind, setItemKind] = useState<"product" | "material">("material");
  const [productId, setProductId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState("");
  const [batchNumber, setBatchNumber] = useState("");

  const { data: factories } = useFactories(1, "");
  const { data: warehouses } = useWarehouses(factoryId);
  const { data: products } = useProducts(1, "");
  const { data: materials } = useMaterials(1, "");
  const mutation = useTransferStock();

  const canSubmit = fromWarehouseId && toWarehouseId && fromWarehouseId !== toWarehouseId && quantity > 0 && unit && (itemKind === "product" ? productId : materialId);

  function handleSubmit() {
    if (!canSubmit) return;
    mutation.mutate(
      {
        fromWarehouseId,
        toWarehouseId,
        productId: itemKind === "product" ? productId : undefined,
        materialId: itemKind === "material" ? materialId : undefined,
        batchNumber: batchNumber || undefined,
        quantity,
        unit,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Factory *</Label>
          <Select value={factoryId} onValueChange={(v) => { setFactoryId(v ?? ""); setFromWarehouseId(""); setToWarehouseId(""); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select factory" /></SelectTrigger>
            <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>From warehouse *</Label>
            <Select value={fromWarehouseId} onValueChange={(v) => setFromWarehouseId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{warehouses?.data.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To warehouse *</Label>
            <Select value={toWarehouseId} onValueChange={(v) => setToWarehouseId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{warehouses?.data.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Item type *</Label>
          <Select value={itemKind} onValueChange={(v) => setItemKind((v as "product" | "material") ?? "material")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="material">Raw material</SelectItem>
              <SelectItem value="product">Finished product</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {itemKind === "material" ? (
          <div className="space-y-1.5">
            <Label>Material *</Label>
            <Select value={materialId} onValueChange={(v) => { const m = materials?.data.find((mm) => mm.id === v); setMaterialId(v ?? ""); if (m) setUnit(m.unit); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select material" /></SelectTrigger>
              <SelectContent>{materials?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={productId} onValueChange={(v) => { const p = products?.data.find((pp) => pp.id === v); setProductId(v ?? ""); if (p) setUnit(p.unit); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>{products?.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Unit *</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Batch number (optional)</Label><Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || mutation.isPending} onClick={handleSubmit}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Transfer
        </Button>
      </div>
    </div>
  );
}
