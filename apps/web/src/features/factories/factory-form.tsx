"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateFactoryInput } from "./types";
import { Loader2 } from "lucide-react";

export function FactoryForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  isEdit,
}: {
  defaultValues?: Partial<CreateFactoryInput>;
  onSubmit: (values: CreateFactoryInput) => void;
  isSubmitting?: boolean;
  submitLabel: string;
  isEdit?: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateFactoryInput>({ defaultValues });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code *</Label>
            <Input id="code" disabled={isEdit} placeholder="F01" {...register("code", { required: true })} />
            {errors.code && <p className="text-xs text-destructive">Code is required</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" {...register("city")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" {...register("name", { required: true })} />
          {errors.name && <p className="text-xs text-destructive">Name is required</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" {...register("address")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input id="contactPhone" {...register("contactPhone")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input id="contactEmail" type="email" {...register("contactEmail")} />
          </div>
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
