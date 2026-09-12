"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useCompanySettings, useUpdateCompanySettings } from "@/features/settings/hooks";
import { WEEKDAY_LABELS, type UpdateTenantSettingsInput } from "@/features/settings/types";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Action, Resource } from "@abytetex/types";
import { Loader2 } from "lucide-react";

export default function CompanySettingsPage() {
  return (
    <PermissionGate resource={Resource.TENANT} action={Action.VIEW}>
      <CompanySettingsPageContent />
    </PermissionGate>
  );
}

function CompanySettingsPageContent() {
  const { data, isLoading } = useCompanySettings();
  const updateMutation = useUpdateCompanySettings();

  const { register, handleSubmit, watch, setValue, reset } = useForm<UpdateTenantSettingsInput>();

  useEffect(() => {
    if (data?.data) {
      reset({
        name: data.data.name,
        address: data.data.address ?? undefined,
        contactEmail: data.data.contactEmail ?? undefined,
        contactPhone: data.data.contactPhone ?? undefined,
        taxNumber: data.data.taxNumber ?? undefined,
        currency: data.data.currency,
        timezone: data.data.timezone,
        fiscalYearStartMonth: data.data.fiscalYearStartMonth,
        workingDays: data.data.workingDays,
        workingHoursStart: data.data.workingHoursStart,
        workingHoursEnd: data.data.workingHoursEnd,
      });
    }
  }, [data, reset]);

  const workingDays = watch("workingDays") ?? [];

  function toggleDay(day: number) {
    setValue("workingDays", workingDays.includes(day) ? workingDays.filter((d) => d !== day) : [...workingDays, day].sort());
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Company Settings" description="Configure company-wide defaults (SRS §5.2)." />

      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit((values) => updateMutation.mutate(values))} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Company name</Label>
              <Input id="name" {...register("name")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register("address")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contactEmail">Contact email</Label>
                <Input id="contactEmail" type="email" {...register("contactEmail")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactPhone">Contact phone</Label>
                <Input id="contactPhone" {...register("contactPhone")} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="taxNumber">Tax number</Label>
                <Input id="taxNumber" {...register("taxNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" {...register("currency")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" {...register("timezone")} />
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="fiscalYearStartMonth">Fiscal year start month (1–12)</Label>
              <Input id="fiscalYearStartMonth" type="number" min={1} max={12} {...register("fiscalYearStartMonth", { valueAsNumber: true })} />
            </div>

            <div className="space-y-2">
              <Label>Working days</Label>
              <div className="flex gap-3">
                {WEEKDAY_LABELS.map((label, day) => (
                  <label key={day} className="flex flex-col items-center gap-1 text-xs">
                    <Checkbox checked={workingDays.includes(day)} onCheckedChange={() => toggleDay(day)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="workingHoursStart">Working hours start</Label>
                <Input id="workingHoursStart" type="time" {...register("workingHoursStart")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workingHoursEnd">Working hours end</Label>
                <Input id="workingHoursEnd" type="time" {...register("workingHoursEnd")} />
              </div>
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
