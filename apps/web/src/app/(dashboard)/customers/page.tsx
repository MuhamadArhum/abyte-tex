"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCreateCustomer, useCustomers, useUpdateCustomer } from "@/features/customers/hooks";
import { CustomerForm, type CustomerFormValues } from "@/features/customers/customer-form";
import type { Customer } from "@/features/customers/types";
import { Plus, Search } from "lucide-react";

function toFormDefaults(c: Customer): Partial<CustomerFormValues> {
  return {
    name: c.name,
    contactPerson: c.contactPerson ?? undefined,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    address: c.address ?? undefined,
    taxNumber: c.taxNumber ?? undefined,
    paymentTerms: c.paymentTerms ?? undefined,
    creditLimit: c.creditLimit ? Number(c.creditLimit) : undefined,
    status: c.status,
  };
}

export default function CustomersPage() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useCustomers(page, debouncedSearch);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer(editing?.id ?? "");

  function handleSubmit(values: CustomerFormValues) {
    if (editing) {
      updateMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    } else {
      createMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    }
  }

  const columns: Column<Customer>[] = [
    { header: "Name", cell: (c) => <span className="font-medium">{c.name}</span> },
    { header: "Contact person", cell: (c) => c.contactPerson ?? "—" },
    { header: "Phone", cell: (c) => c.phone ?? "—" },
    { header: "Credit limit", cell: (c) => (c.creditLimit ? Number(c.creditLimit).toLocaleString() : "—") },
    { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer master data (SRS §5.4.3)"
        actions={
          can(Resource.CUSTOMER, Action.CREATE) ? (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Customer
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, contact, or phone…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(c) => c.id}
        onRowClick={
          can(Resource.CUSTOMER, Action.UPDATE)
            ? (c) => {
                setEditing(c);
                setSheetOpen(true);
              }
            : undefined
        }
        emptyMessage="No customers yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{editing ? "Edit Customer" : "Add Customer"}</SheetTitle>
          </SheetHeader>
          <CustomerForm
            key={editing?.id ?? "new"}
            defaultValues={editing ? toFormDefaults(editing) : undefined}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            submitLabel={editing ? "Save changes" : "Create customer"}
            isEdit={!!editing}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
