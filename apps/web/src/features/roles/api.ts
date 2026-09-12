import { api } from "@/lib/api-client";
import type { Role } from "./types";

export function listRoles() {
  return api.get<Role[]>("/roles");
}

export function getRole(id: string) {
  return api.get<Role>(`/roles/${id}`);
}

export function setRolePermissions(id: string, permissions: Array<{ resource: string; action: string }>) {
  return api.put<Role>(`/roles/${id}/permissions`, { permissions });
}
