"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoles } from "@/features/roles/hooks";
import { useFactories } from "@/features/factories/hooks";
import type { UserStatus } from "./types";
import { Loader2 } from "lucide-react";

export interface UserFormValues {
  email?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status?: UserStatus;
  roleIds: string[];
  factoryIds: string[];
}

export function UserForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  isEdit,
}: {
  defaultValues?: Partial<UserFormValues>;
  onSubmit: (values: UserFormValues) => void;
  isSubmitting?: boolean;
  submitLabel: string;
  isEdit?: boolean;
}) {
  const { data: roles } = useRoles();
  const { data: factories } = useFactories(1, "");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({ defaultValues: { roleIds: [], factoryIds: [], ...defaultValues } });

  const roleIds = watch("roleIds") ?? [];
  const factoryIds = watch("factoryIds") ?? [];
  const status = watch("status");

  function toggleRole(id: string) {
    setValue("roleIds", roleIds.includes(id) ? roleIds.filter((r) => r !== id) : [...roleIds, id]);
  }

  function toggleFactory(id: string) {
    setValue("factoryIds", factoryIds.includes(id) ? factoryIds.filter((f) => f !== id) : [...factoryIds, id]);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        {!isEdit && (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" {...register("email", { required: !isEdit })} />
            {errors.email && <p className="text-xs text-destructive">Email is required</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name *</Label>
            <Input id="firstName" {...register("firstName", { required: true })} />
            {errors.firstName && <p className="text-xs text-destructive">Required</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name *</Label>
            <Input id="lastName" {...register("lastName", { required: true })} />
            {errors.lastName && <p className="text-xs text-destructive">Required</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...register("phone")} />
        </div>

        {isEdit && (
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setValue("status", v as UserStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="LOCKED">Locked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Roles *</Label>
          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {roles?.data.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={roleIds.includes(role.id)} onCheckedChange={() => toggleRole(role.id)} />
                {role.name}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Factory access</Label>
          <p className="text-xs text-muted-foreground">Leave empty for access to all factories in the company.</p>
          <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {factories?.data.map((factory) => (
              <label key={factory.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={factoryIds.includes(factory.id)} onCheckedChange={() => toggleFactory(factory.id)} />
                {factory.name} ({factory.code})
              </label>
            ))}
            {factories?.data.length === 0 && <p className="text-xs text-muted-foreground">No factories configured yet.</p>}
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
