import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { getRole, listRoles, setRolePermissions } from "./api";

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => listRoles() });
}

export function useRole(id: string | undefined) {
  return useQuery({ queryKey: ["roles", id], queryFn: () => getRole(id!), enabled: !!id });
}

export function useSetRolePermissions(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (permissions: Array<{ resource: string; action: string }>) => setRolePermissions(id, permissions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Permissions updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update permissions"),
  });
}
