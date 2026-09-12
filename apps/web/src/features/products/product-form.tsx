"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductCategories } from "./hooks";
import type { CreateProductInput, ProductStatus } from "./types";
import { Loader2 } from "lucide-react";

export interface ProductFormValues extends CreateProductInput {
  status?: ProductStatus;
}

export function ProductForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  showStatus,
}: {
  defaultValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => void;
  isSubmitting?: boolean;
  submitLabel: string;
  showStatus?: boolean;
}) {
  const { data: categories } = useProductCategories();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({ defaultValues });

  const categoryId = watch("categoryId");
  const status = watch("status");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU *</Label>
            <Input id="sku" {...register("sku", { required: true })} />
            {errors.sku && <p className="text-xs text-destructive">SKU is required</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">Product code</Label>
            <Input id="code" {...register("code")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" {...register("name", { required: true })} />
          {errors.name && <p className="text-xs text-destructive">Name is required</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId ?? undefined} onValueChange={(v) => setValue("categoryId", v ?? undefined)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories?.data.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit">Unit *</Label>
            <Input id="unit" placeholder="MTR, KG, PCS…" {...register("unit", { required: true })} />
            {errors.unit && <p className="text-xs text-destructive">Unit is required</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fabricType">Fabric type</Label>
            <Input id="fabricType" {...register("fabricType")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" {...register("brand")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gsm">GSM</Label>
            <Input id="gsm" type="number" step="any" {...register("gsm", { valueAsNumber: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="width">Width</Label>
            <Input id="width" type="number" step="any" {...register("width", { valueAsNumber: true })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="color">Color</Label>
            <Input id="color" {...register("color")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shade">Shade</Label>
            <Input id="shade" {...register("shade")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="composition">Composition</Label>
          <Input id="composition" placeholder="e.g. 100% Cotton" {...register("composition")} />
        </div>

        {showStatus && (
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setValue("status", v as ProductStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
