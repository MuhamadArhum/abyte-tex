import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";
import type { CreateCustomerInput, Customer, UpdateCustomerInput } from "./types";

export function listCustomers(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<Customer[]>(`/customers?${qs}`) as Promise<{ data: Customer[]; meta: PaginatedMeta }>;
}

export function createCustomer(input: CreateCustomerInput) {
  return api.post<Customer>("/customers", input);
}

export function updateCustomer(id: string, input: UpdateCustomerInput) {
  return api.patch<Customer>(`/customers/${id}`, input);
}
