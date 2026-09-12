"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useProductionOrder, useProductionOrders } from "@/features/production/hooks";
import { useCreateCostSheet, useCostSheets } from "@/features/costing/hooks";
import type { CostSheet } from "@/features/costing/api";
import { Loader2, Plus } from "lucide-react";

export default function CostingPage() {
  return (
    <PermissionGate resource={Resource.COST_SHEET} action={Action.VIEW}>
      <CostingPageContent />
    </PermissionGate>
  );
}

function CostingPageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCostSheets(page);
  const [sheetOpen, setSheetOpen] = useState(false);

  const columns: Column<CostSheet>[] = [
    { header: "Date", cell: (c) => new Date(c.createdAt).toLocaleDateString() },
    { header: "Order", cell: (c) => c.productionOrder?.orderNumber ?? "—" },
    { header: "Batch", cell: (c) => c.productionBatch?.batchNumber ?? "—" },
    { header: "Total cost", cell: (c) => Number(c.totalCost).toLocaleString() },
    { header: "Cost/unit", cell: (c) => (c.costPerUnit ? Number(c.costPerUnit).toFixed(2) : "—") },
    { header: "Variance", cell: (c) => (c.variance != null ? <span className={Number(c.variance) > 0 ? "text-destructive" : "text-emerald-600"}>{Number(c.variance).toLocaleString()}</span> : "—") },
  ];

  return (
    <div>
      <PageHeader
        title="Costing"
        description="Production cost sheets — Material + Labor + Machine + Energy + Packing + Overhead (SRS §11)"
        actions={can(Resource.COST_SHEET, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Cost Sheet</Button> : undefined}
      />

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} rowKey={(c) => c.id} emptyMessage="No cost sheets yet." />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>New Cost Sheet</SheetTitle></SheetHeader>
          <CreateCostSheetForm onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CreateCostSheetForm({ onDone }: { onDone: () => void }) {
  const [productionOrderId, setProductionOrderId] = useState("");
  const [productionBatchId, setProductionBatchId] = useState("");
  const [materialCost, setMaterialCost] = useState("0");
  const [laborCost, setLaborCost] = useState("0");
  const [machineCost, setMachineCost] = useState("0");
  const [energyCost, setEnergyCost] = useState("0");
  const [packingCost, setPackingCost] = useState("0");
  const [overheadCost, setOverheadCost] = useState("0");
  const [estimatedCost, setEstimatedCost] = useState("");

  const { data: orders } = useProductionOrders(1);
  const { data: orderDetail } = useProductionOrder(productionOrderId);
  const mutation = useCreateCostSheet();

  const total = [materialCost, laborCost, machineCost, energyCost, packingCost, overheadCost].reduce((s, v) => s + (Number(v) || 0), 0);

  function handleSubmit() {
    mutation.mutate(
      {
        productionOrderId: productionOrderId || undefined,
        productionBatchId: productionBatchId || undefined,
        materialCost: Number(materialCost) || 0,
        laborCost: Number(laborCost) || 0,
        machineCost: Number(machineCost) || 0,
        energyCost: Number(energyCost) || 0,
        packingCost: Number(packingCost) || 0,
        overheadCost: Number(overheadCost) || 0,
        estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Production order (optional)</Label>
          <Select value={productionOrderId || undefined} onValueChange={(v) => { setProductionOrderId(v ?? ""); setProductionBatchId(""); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="None">{orders?.data.find((o) => o.id === productionOrderId)?.orderNumber}</SelectValue></SelectTrigger>
            <SelectContent>{orders?.data.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNumber}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {productionOrderId && (
          <div className="space-y-1.5">
            <Label>Batch (optional)</Label>
            <Select value={productionBatchId || undefined} onValueChange={(v) => setProductionBatchId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="None">{orderDetail?.data.batches?.find((b) => b.id === productionBatchId)?.batchNumber}</SelectValue></SelectTrigger>
              <SelectContent>{orderDetail?.data.batches?.map((b) => <SelectItem key={b.id} value={b.id}>{b.batchNumber}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Material cost *</Label><Input type="number" step="any" value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Labor cost *</Label><Input type="number" step="any" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Machine cost *</Label><Input type="number" step="any" value={machineCost} onChange={(e) => setMachineCost(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Energy cost *</Label><Input type="number" step="any" value={energyCost} onChange={(e) => setEnergyCost(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Packing cost *</Label><Input type="number" step="any" value={packingCost} onChange={(e) => setPackingCost(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Overhead cost *</Label><Input type="number" step="any" value={overheadCost} onChange={(e) => setOverheadCost(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Estimated cost (optional, for variance)</Label><Input type="number" step="any" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} /></div>
        <p className="text-right text-sm font-medium">Total: {total.toLocaleString()}</p>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={mutation.isPending} onClick={handleSubmit}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create cost sheet
        </Button>
      </div>
    </div>
  );
}
