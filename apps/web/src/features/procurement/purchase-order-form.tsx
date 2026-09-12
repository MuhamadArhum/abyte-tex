"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFactories } from "@/features/factories/hooks";
import { useSuppliers } from "@/features/suppliers/hooks";
import { useMaterials } from "@/features/materials/hooks";
import type { CreatePurchaseOrderInput } from "./api";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface Row {
  materialId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export function PurchaseOrderForm({ onSubmit, isSubmitting }: { onSubmit: (values: CreatePurchaseOrderInput) => void; isSubmitting?: boolean }) {
  const { data: factories } = useFactories(1, "");
  const { data: suppliers } = useSuppliers(1, "");
  const { data: materials } = useMaterials(1, "");

  const [factoryId, setFactoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<Row[]>([{ materialId: "", quantity: 1, unit: "", unitPrice: 0 }]);

  function updateItem(index: number, patch: Partial<Row>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { materialId: "", quantity: 1, unit: "", unitPrice: 0 }]);
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const canSubmit = factoryId && supplierId && items.every((i) => i.materialId && i.quantity > 0 && i.unit);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Factory *</Label>
            <Select value={factoryId || undefined} onValueChange={(v) => setFactoryId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select factory">{factories?.data.find((f) => f.id === factoryId)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Supplier *</Label>
            <Select value={supplierId || undefined} onValueChange={(v) => setSupplierId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select supplier">{suppliers?.data.find((s) => s.id === supplierId)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{suppliers?.data.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Materials *</Label>
            <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Add item</Button>
          </div>
          <div className="space-y-2 rounded-md border p-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 items-end gap-1.5 border-b pb-2 last:border-0 last:pb-0">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Material</Label>
                  <Select
                    value={item.materialId || undefined}
                    onValueChange={(v) => {
                      const m = materials?.data.find((mm) => mm.id === v);
                      updateItem(index, { materialId: v ?? "", unit: m?.unit ?? item.unit });
                    }}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Material">{materials?.data.find((m) => m.id === item.materialId)?.name}</SelectValue></SelectTrigger>
                    <SelectContent>{materials?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" step="any" value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input value={item.unit} onChange={(e) => updateItem(index, { unit: e.target.value })} />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Unit price</Label>
                  <Input type="number" step="any" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })} />
                </div>
                <div className="col-span-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-right text-sm font-medium">Total: {total.toLocaleString()}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          disabled={!canSubmit || isSubmitting}
          onClick={() => canSubmit && onSubmit({ factoryId, supplierId, items })}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create purchase order
        </Button>
      </div>
    </div>
  );
}
