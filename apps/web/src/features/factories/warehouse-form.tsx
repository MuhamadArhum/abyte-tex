"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WAREHOUSE_TYPES, type CreateWarehouseInput, type WarehouseType } from "./types";
import { Loader2 } from "lucide-react";

const TYPE_LABELS: Record<WarehouseType, string> = {
  RAW_MATERIAL: "Raw Material",
  WIP: "Work in Progress",
  FINISHED_GOODS: "Finished Goods",
  PACKING: "Packing",
  GENERAL: "General",
};

export function WarehouseForm({
  onSubmit,
  isSubmitting,
  submitLabel,
}: {
  onSubmit: (values: CreateWarehouseInput) => void;
  isSubmitting?: boolean;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateWarehouseInput>({ defaultValues: { type: "GENERAL" } });

  const type = watch("type");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code *</Label>
            <Input id="code" placeholder="WH-RM" {...register("code", { required: true })} />
            {errors.code && <p className="text-xs text-destructive">Code is required</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setValue("type", v as WarehouseType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAREHOUSE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" placeholder="Raw Material Warehouse" {...register("name", { required: true })} />
          {errors.name && <p className="text-xs text-destructive">Name is required</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" {...register("address")} />
        </div>
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
