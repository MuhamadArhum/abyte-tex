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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useFactories } from "@/features/factories/hooks";
import { useSalesOrders } from "@/features/sales/hooks";
import { useCreateQualityInspection, useQualityInspections } from "@/features/quality/hooks";
import { DEFECT_SEVERITIES, QUALITY_OUTCOMES, type DefectSeverity, type QualityInspection, type QualityOutcome } from "@/features/quality/api";
import { Loader2, Plus, Trash2 } from "lucide-react";

export default function QualityPage() {
  return (
    <PermissionGate resource={Resource.QUALITY_INSPECTION} action={Action.VIEW}>
      <QualityPageContent />
    </PermissionGate>
  );
}

function QualityPageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQualityInspections(page);
  const [sheetOpen, setSheetOpen] = useState(false);

  const columns: Column<QualityInspection>[] = [
    { header: "Date", cell: (q) => new Date(q.createdAt).toLocaleDateString() },
    { header: "Outcome", cell: (q) => <StatusBadge status={q.outcome} /> },
    { header: "GSM", cell: (q) => q.gsm ?? "—" },
    { header: "Shade", cell: (q) => q.shade ?? "—" },
    { header: "Defects", cell: (q) => q.defects.length },
    { header: "Notes", cell: (q) => q.notes ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Quality Inspections"
        description="Textile-specific quality checks — GSM, width, shade, defects (SRS §9.1)"
        actions={can(Resource.QUALITY_INSPECTION, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Inspection</Button> : undefined}
      />

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} rowKey={(q) => q.id} emptyMessage="No inspections recorded yet." />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-4 sm:max-w-lg">
          <SheetHeader className="px-1"><SheetTitle>New Quality Inspection</SheetTitle></SheetHeader>
          <CreateInspectionForm onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CreateInspectionForm({ onDone }: { onDone: () => void }) {
  const [factoryId, setFactoryId] = useState("");
  const [salesOrderId, setSalesOrderId] = useState("");
  const [outcome, setOutcome] = useState<QualityOutcome>("PASS");
  const [gsm, setGsm] = useState("");
  const [width, setWidth] = useState("");
  const [shade, setShade] = useState("");
  const [rollLength, setRollLength] = useState("");
  const [weight, setWeight] = useState("");
  const [colorVariation, setColorVariation] = useState("");
  const [stitchingDefects, setStitchingDefects] = useState("");
  const [notes, setNotes] = useState("");
  const [defects, setDefects] = useState<Array<{ defectType: string; severity: DefectSeverity; quantity: string; notes: string }>>([]);

  const { data: factories } = useFactories(1, "");
  const { data: salesOrders } = useSalesOrders(1, "");
  const createMutation = useCreateQualityInspection();

  const canSubmit = factoryId && outcome;

  function addDefectRow() {
    setDefects((prev) => [...prev, { defectType: "", severity: "MINOR", quantity: "", notes: "" }]);
  }
  function updateDefect(i: number, patch: Partial<(typeof defects)[number]>) {
    setDefects((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function removeDefect(i: number) {
    setDefects((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        factoryId,
        salesOrderId: salesOrderId || undefined,
        outcome,
        gsm: gsm ? Number(gsm) : undefined,
        width: width ? Number(width) : undefined,
        shade: shade || undefined,
        rollLength: rollLength ? Number(rollLength) : undefined,
        weight: weight ? Number(weight) : undefined,
        colorVariation: colorVariation || undefined,
        stitchingDefects: stitchingDefects || undefined,
        notes: notes || undefined,
        defects: defects.filter((d) => d.defectType).map((d) => ({ defectType: d.defectType, severity: d.severity, quantity: d.quantity ? Number(d.quantity) : undefined, notes: d.notes || undefined })),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Factory *</Label>
          <Select value={factoryId || undefined} onValueChange={(v) => setFactoryId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select factory">{factories?.data.find((f) => f.id === factoryId)?.name}</SelectValue></SelectTrigger>
            <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Related sales order (optional)</Label>
          <Select value={salesOrderId || undefined} onValueChange={(v) => setSalesOrderId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="None">{salesOrders?.data.find((o) => o.id === salesOrderId)?.orderNumber}</SelectValue></SelectTrigger>
            <SelectContent>{salesOrders?.data.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNumber}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Outcome *</Label>
          <Select value={outcome} onValueChange={(v) => setOutcome((v as QualityOutcome) ?? "PASS")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{QUALITY_OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>GSM</Label><Input type="number" step="any" value={gsm} onChange={(e) => setGsm(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Width</Label><Input type="number" step="any" value={width} onChange={(e) => setWidth(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Roll length</Label><Input type="number" step="any" value={rollLength} onChange={(e) => setRollLength(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Weight</Label><Input type="number" step="any" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Shade</Label><Input value={shade} onChange={(e) => setShade(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Color variation</Label><Input value={colorVariation} onChange={(e) => setColorVariation(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Stitching defects</Label><Input value={stitchingDefects} onChange={(e) => setStitchingDefects(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Defects</Label>
            <Button type="button" size="sm" variant="outline" onClick={addDefectRow}><Plus className="h-3.5 w-3.5" /> Add defect</Button>
          </div>
          {defects.map((d, i) => (
            <div key={i} className="flex items-end gap-2 rounded-md border p-2">
              <div className="flex-1 space-y-1"><Label className="text-xs">Type</Label><Input value={d.defectType} onChange={(e) => updateDefect(i, { defectType: e.target.value })} /></div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">Severity</Label>
                <Select value={d.severity} onValueChange={(v) => updateDefect(i, { severity: (v as DefectSeverity) ?? "MINOR" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{DEFECT_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="w-20 space-y-1"><Label className="text-xs">Qty</Label><Input type="number" step="any" value={d.quantity} onChange={(e) => updateDefect(i, { quantity: e.target.value })} /></div>
              <Button type="button" size="icon" variant="ghost" onClick={() => removeDefect(i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || createMutation.isPending} onClick={handleSubmit}>
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Record inspection
        </Button>
      </div>
    </div>
  );
}
