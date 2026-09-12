"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CreateSupplierInput, PartyStatus } from "./types";
import { Loader2, Star } from "lucide-react";

export interface SupplierFormValues extends CreateSupplierInput {
  status?: PartyStatus;
}

export function SupplierForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  isEdit,
}: {
  defaultValues?: Partial<SupplierFormValues>;
  onSubmit: (values: SupplierFormValues) => void;
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
  } = useForm<SupplierFormValues>({ defaultValues });

  const status = watch("status");
  const rating = watch("rating");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Supplier name *</Label>
          <Input id="name" {...register("name", { required: true })} />
          {errors.name && <p className="text-xs text-destructive">Name is required</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contactPerson">Contact person</Label>
            <Input id="contactPerson" {...register("contactPerson")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register("phone")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" {...register("address")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paymentTerms">Payment terms</Label>
          <Input id="paymentTerms" placeholder="e.g. Net 30" {...register("paymentTerms")} />
        </div>

        <div className="space-y-1.5">
          <Label>Rating</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setValue("rating", n)} className="p-0.5">
                <Star className={`h-5 w-5 ${rating && n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
        </div>

        {isEdit && (
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setValue("status", v as PartyStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="BLOCKED">Blocked</SelectItem>
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
