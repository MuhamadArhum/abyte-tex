"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useFactories } from "@/features/factories/hooks";
import { useCreatePayrollPeriod, usePayrollPeriods } from "@/features/payroll/hooks";
import type { PayrollPeriod } from "@/features/payroll/api";
import { Loader2, Plus } from "lucide-react";

export default function PayrollPage() {
  return (
    <PermissionGate resource={Resource.PAYROLL} action={Action.VIEW}>
      <PayrollPageContent />
    </PermissionGate>
  );
}

function PayrollPageContent() {
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePayrollPeriods(page);
  const [sheetOpen, setSheetOpen] = useState(false);

  const columns: Column<PayrollPeriod>[] = [
    { header: "Period", cell: (p) => `${new Date(p.periodStart).toLocaleDateString()} — ${new Date(p.periodEnd).toLocaleDateString()}` },
    { header: "Entries", cell: (p) => p.entries.length },
    { header: "Net total", cell: (p) => p.entries.reduce((s, e) => s + Number(e.netAmount), 0).toLocaleString() },
    { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Payroll periods and entries — inputs only, not a full payroll engine (SRS §10.3)"
        actions={can(Resource.PAYROLL, Action.CREATE) ? <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> New Period</Button> : undefined}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(p) => p.id}
        onRowClick={(p) => router.push(`/payroll/${p.id}`)}
        emptyMessage="No payroll periods yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>New Payroll Period</SheetTitle></SheetHeader>
          <CreatePeriodForm onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CreatePeriodForm({ onDone }: { onDone: () => void }) {
  const [factoryId, setFactoryId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const { data: factories } = useFactories(1, "");
  const mutation = useCreatePayrollPeriod();

  const canSubmit = factoryId && periodStart && periodEnd;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Factory *</Label>
          <Select value={factoryId || undefined} onValueChange={(v) => setFactoryId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select factory">{factories?.data.find((f) => f.id === factoryId)?.name}</SelectValue></SelectTrigger>
            <SelectContent>{factories?.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Period start *</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Period end *</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          disabled={!canSubmit || mutation.isPending}
          onClick={() => mutation.mutate({ factoryId, periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString() }, { onSuccess: onDone })}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create period
        </Button>
      </div>
    </div>
  );
}
