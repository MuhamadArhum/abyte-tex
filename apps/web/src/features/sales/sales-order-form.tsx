"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFactories } from "@/features/factories/hooks";
import { useCustomers } from "@/features/customers/hooks";
import { useProducts } from "@/features/products/hooks";
import type { CreateSalesOrderInput, CreateSalesOrderItemInput } from "./api";
import { Loader2, Plus, Trash2 } from "lucide-react";

export function SalesOrderForm({ onSubmit, isSubmitting }: { onSubmit: (values: CreateSalesOrderInput) => void; isSubmitting?: boolean }) {
  const { data: factories } = useFactories(1, "");
  const { data: customers } = useCustomers(1, "");
  const { data: products } = useProducts(1, "");

  const [factoryId, setFactoryId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<CreateSalesOrderItemInput[]>([{ productId: "", quantity: 1, unit: "", unitPrice: 0 }]);

  function updateItem(index: number, patch: Partial<CreateSalesOrderItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { productId: "", quantity: 1, unit: "", unitPrice: 0 }]);
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice - (i.discount ?? 0), 0);
  const canSubmit = factoryId && customerId && items.every((i) => i.productId && i.quantity > 0 && i.unit);

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ factoryId, customerId, notes: notes || undefined, items });
  }

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
            <Label>Customer *</Label>
            <Select value={customerId || undefined} onValueChange={(v) => setCustomerId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select customer">{customers?.data.find((c) => c.id === customerId)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{customers?.data.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Order items *</Label>
            <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Add item</Button>
          </div>
          <div className="space-y-2 rounded-md border p-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 items-end gap-1.5 border-b pb-2 last:border-0 last:pb-0">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Product</Label>
                  <Select
                    value={item.productId || undefined}
                    onValueChange={(v) => {
                      const p = products?.data.find((pr) => pr.id === v);
                      updateItem(index, { productId: v ?? "", unit: p?.unit ?? item.unit });
                    }}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Product">{products?.data.find((p) => p.id === item.productId)?.name}</SelectValue></SelectTrigger>
                    <SelectContent>{products?.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
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

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create sales order
        </Button>
      </div>
    </div>
  );
}
