import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { getCompanySettings, updateCompanySettings } from "./api";
import type { UpdateTenantSettingsInput } from "./types";

export function useCompanySettings() {
  return useQuery({ queryKey: ["company-settings"], queryFn: () => getCompanySettings() });
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantSettingsInput) => updateCompanySettings(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Company settings updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update settings"),
  });
}
