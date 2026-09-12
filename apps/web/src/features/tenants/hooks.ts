import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createTenant, listTenants, updateTenantStatus } from "./api";
import type { CreateTenantInput, TenantStatus } from "./types";

export function useTenants(page: number, search: string) {
  return useQuery({
    queryKey: ["platform-tenants", page, search],
    queryFn: () => listTenants({ page, search: search || undefined }),
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-tenants"] });
      toast.success("Tenant created — a welcome email was sent to the owner.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create tenant"),
  });
}

export function useUpdateTenantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) => updateTenantStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-tenants"] });
      toast.success("Tenant status updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update tenant status"),
  });
}
