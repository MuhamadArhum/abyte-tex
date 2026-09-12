import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";
import type { CreateTenantInput, PlatformTenant, TenantStatus } from "./types";

export function listTenants(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<PlatformTenant[]>(`/tenants?${qs}`) as Promise<{ data: PlatformTenant[]; meta: PaginatedMeta }>;
}

export function createTenant(input: CreateTenantInput) {
  return api.post<{ tenant: PlatformTenant; owner: { id: string; email: string } }>("/tenants", input);
}

export function updateTenantStatus(id: string, status: TenantStatus) {
  return api.patch<PlatformTenant>(`/tenants/${id}/status`, { status });
}
