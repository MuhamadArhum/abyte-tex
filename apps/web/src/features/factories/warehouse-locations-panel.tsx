"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCreateLocation, useLocations } from "./hooks";
import { Loader2, Plus } from "lucide-react";

interface LocationFormValues {
  code: string;
  name: string;
  rack?: string;
  bin?: string;
}

export function WarehouseLocationsPanel({ factoryId, warehouseId }: { factoryId: string; warehouseId: string }) {
  const { data, isLoading } = useLocations(factoryId, warehouseId, true);
  const createMutation = useCreateLocation(factoryId, warehouseId);
  const { register, handleSubmit, reset } = useForm<LocationFormValues>();

  function onSubmit(values: LocationFormValues) {
    createMutation.mutate(values, { onSuccess: () => reset() });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-1 py-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data?.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No locations yet. Add the first rack/bin below.</p>
        ) : (
          data?.data.map((loc) => (
            <div key={loc.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{loc.code}</span>
              <span className="text-muted-foreground">{loc.name}</span>
              <span className="text-xs text-muted-foreground">
                {[loc.rack, loc.bin].filter(Boolean).join(" / ") || "—"}
              </span>
            </div>
          ))
        )}
      </div>

      <Separator className="my-2" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 px-1 pb-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">Add location</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Code *" {...register("code", { required: true })} />
          <Input placeholder="Name *" {...register("name", { required: true })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Rack" {...register("rack")} />
          <Input placeholder="Bin" {...register("bin")} />
        </div>
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </form>
    </div>
  );
}
