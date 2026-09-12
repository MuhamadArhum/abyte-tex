"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CreateCustomerInput, PartyStatus } from "./types";
import { Loader2 } from "lucide-react";

export interface CustomerFormValues extends CreateCustomerInput {
  status?: PartyStatus;
}

export function CustomerForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  isEdit,
}: {
  defaultValues?: Partial<CustomerFormValues>;
  onSubmit: (values: CustomerFormValues) => void;
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
  } = useForm<CustomerFormValues>({ defaultValues });

  const status = watch("status");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Company name *</Label>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="taxNumber">Tax number</Label>
            <Input id="taxNumber" {...register("taxNumber")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentTerms">Payment terms</Label>
            <Input id="paymentTerms" placeholder="e.g. Net 30" {...register("paymentTerms")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="creditLimit">Credit limit</Label>
          <Input id="creditLimit" type="number" step="any" {...register("creditLimit", { valueAsNumber: true })} />
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
