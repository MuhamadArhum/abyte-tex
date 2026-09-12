"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateDepartmentInput } from "./types";
import { Loader2 } from "lucide-react";

export function DepartmentForm({
  onSubmit,
  isSubmitting,
  submitLabel,
}: {
  onSubmit: (values: CreateDepartmentInput) => void;
  isSubmitting?: boolean;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateDepartmentInput>();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code *</Label>
          <Input id="code" placeholder="WVG" {...register("code", { required: true })} />
          {errors.code && <p className="text-xs text-destructive">Code is required</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" placeholder="Weaving" {...register("name", { required: true })} />
          {errors.name && <p className="text-xs text-destructive">Name is required</p>}
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
