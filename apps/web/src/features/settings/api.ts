import { api } from "@/lib/api-client";
import type { TenantSettings, UpdateTenantSettingsInput } from "./types";

export function getCompanySettings() {
  return api.get<TenantSettings>("/tenants/me/company");
}

export function updateCompanySettings(input: UpdateTenantSettingsInput) {
  return api.patch<TenantSettings>("/tenants/me/company", input);
}
