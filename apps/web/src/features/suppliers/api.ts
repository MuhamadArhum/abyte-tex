import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";
import type { CreateSupplierInput, Supplier, UpdateSupplierInput } from "./types";

export function listSuppliers(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<Supplier[]>(`/suppliers?${qs}`) as Promise<{ data: Supplier[]; meta: PaginatedMeta }>;
}

export function createSupplier(input: CreateSupplierInput) {
  return api.post<Supplier>("/suppliers", input);
}

export function updateSupplier(id: string, input: UpdateSupplierInput) {
  return api.patch<Supplier>(`/suppliers/${id}`, input);
}
