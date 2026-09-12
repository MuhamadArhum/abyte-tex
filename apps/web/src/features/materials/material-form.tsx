"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIAL_TYPES, type CreateMaterialInput, type MaterialStatus, type MaterialType } from "./types";
import { Loader2 } from "lucide-react";

export interface MaterialFormValues extends CreateMaterialInput {
  status?: MaterialStatus;
}

export function MaterialForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  isEdit,
}: {
  defaultValues?: Partial<MaterialFormValues>;
  onSubmit: (values: MaterialFormValues) => void;
  isSubmitting?: boolean;
  submitLabel: string;
  isEdit?: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MaterialFormValues>({ defaultValues: { type: "YARN", ...defaultValues } });

  const type = watch("type");
  const status = watch("status");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code *</Label>
            <Input id="code" disabled={isEdit} {...register("code", { required: true })} />
            {errors.code && <p className="text-xs text-destructive">Code is required</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setValue("type", v as MaterialType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" {...register("name", { required: true })} />
          {errors.name && <p className="text-xs text-destructive">Name is required</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="unit">Unit *</Label>
            <Input id="unit" placeholder="KG, MTR…" {...register("unit", { required: true })} />
            {errors.unit && <p className="text-xs text-destructive">Unit is required</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reorderLevel">Reorder level</Label>
            <Input id="reorderLevel" type="number" step="any" {...register("reorderLevel", { valueAsNumber: true })} />
          </div>
        </div>

        {isEdit && (
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setValue("status", v as MaterialStatus)}>
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
