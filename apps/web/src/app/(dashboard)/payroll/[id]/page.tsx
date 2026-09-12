"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useAddPayrollEntry, usePayrollPeriod, useUpdatePayrollPeriodStatus } from "@/features/payroll/hooks";
import { PAYROLL_STATUSES, type PayrollStatus } from "@/features/payroll/api";
import { useEmployees } from "@/features/employees/hooks";
import { ArrowLeft, ChevronDown, Loader2, Plus } from "lucide-react";

export default function PayrollPeriodDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const { data, isLoading } = usePayrollPeriod(params.id);
  const statusMutation = useUpdatePayrollPeriodStatus(params.id);
  const [entrySheetOpen, setEntrySheetOpen] = useState(false);

  if (isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data?.data) return <p className="text-sm text-muted-foreground">Payroll period not found.</p>;

  const p = data.data;
  const netTotal = p.entries.reduce((s, e) => s + Number(e.netAmount), 0);

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push("/payroll")}>
        <ArrowLeft className="h-4 w-4" /> Back to Payroll
      </Button>
      <PageHeader
        title={`${new Date(p.periodStart).toLocaleDateString()} — ${new Date(p.periodEnd).toLocaleDateString()}`}
        description={`Net total: ${netTotal.toLocaleString()}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={p.status} />
            {can(Resource.PAYROLL, Action.CREATE) && p.status === "DRAFT" && (
              <Button size="sm" onClick={() => setEntrySheetOpen(true)}><Plus className="h-4 w-4" /> Add Entry</Button>
            )}
            {can(Resource.PAYROLL, Action.APPROVE) && (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Change status <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {PAYROLL_STATUSES.filter((s) => s !== p.status).map((s: PayrollStatus) => (
                    <DropdownMenuItem key={s} onClick={() => statusMutation.mutate(s)}>{s.replaceAll("_", " ")}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-sm">Entries</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Overtime</TableHead>
                <TableHead>Incentive</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.employee.firstName} {e.employee.lastName} ({e.employee.employeeCode})</TableCell>
                  <TableCell>{Number(e.baseSalary).toLocaleString()}</TableCell>
                  <TableCell>{Number(e.overtimeAmount).toLocaleString()}</TableCell>
                  <TableCell>{Number(e.incentiveAmount).toLocaleString()}</TableCell>
                  <TableCell>{Number(e.deductions).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{Number(e.netAmount).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {p.entries.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No entries yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={entrySheetOpen} onOpenChange={setEntrySheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1"><SheetTitle>Add Payroll Entry</SheetTitle></SheetHeader>
          <AddEntryForm periodId={p.id} onDone={() => setEntrySheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AddEntryForm({ periodId, onDone }: { periodId: string; onDone: () => void }) {
  const [employeeId, setEmployeeId] = useState("");
  const [baseSalary, setBaseSalary] = useState("0");
  const [overtimeAmount, setOvertimeAmount] = useState("0");
  const [incentiveAmount, setIncentiveAmount] = useState("0");
  const [deductions, setDeductions] = useState("0");

  const { data: employees } = useEmployees(1, "");
  const mutation = useAddPayrollEntry(periodId);

  const canSubmit = employeeId;
  const net = (Number(baseSalary) || 0) + (Number(overtimeAmount) || 0) + (Number(incentiveAmount) || 0) - (Number(deductions) || 0);

  function handleSubmit() {
    if (!canSubmit) return;
    mutation.mutate(
      {
        employeeId,
        baseSalary: Number(baseSalary) || 0,
        overtimeAmount: Number(overtimeAmount) || 0,
        incentiveAmount: Number(incentiveAmount) || 0,
        deductions: Number(deductions) || 0,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-1 pb-4">
        <div className="space-y-1.5">
          <Label>Employee *</Label>
          <Select value={employeeId || undefined} onValueChange={(v) => setEmployeeId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select employee">{(() => { const e = employees?.data.find((emp) => emp.id === employeeId); return e ? `${e.firstName} ${e.lastName} (${e.employeeCode})` : undefined; })()}</SelectValue></SelectTrigger>
            <SelectContent>{employees?.data.map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Base salary *</Label><Input type="number" step="any" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Overtime</Label><Input type="number" step="any" value={overtimeAmount} onChange={(e) => setOvertimeAmount(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Incentive</Label><Input type="number" step="any" value={incentiveAmount} onChange={(e) => setIncentiveAmount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Deductions</Label><Input type="number" step="any" value={deductions} onChange={(e) => setDeductions(e.target.value)} /></div>
        </div>
        <p className="text-right text-sm font-medium">Net: {net.toLocaleString()}</p>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={!canSubmit || mutation.isPending} onClick={handleSubmit}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save entry
        </Button>
      </div>
    </div>
  );
}
