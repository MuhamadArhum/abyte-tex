import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";
import type { CreateMaterialInput, Material, UpdateMaterialInput } from "./types";

export function listMaterials(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<Material[]>(`/materials?${qs}`) as Promise<{ data: Material[]; meta: PaginatedMeta }>;
}

export function createMaterial(input: CreateMaterialInput) {
  return api.post<Material>("/materials", input);
}

export function updateMaterial(id: string, input: UpdateMaterialInput) {
  return api.patch<Material>(`/materials/${id}`, input);
}
