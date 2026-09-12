import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createMaterial, listMaterials, updateMaterial } from "./api";
import type { CreateMaterialInput, UpdateMaterialInput } from "./types";

export function useMaterials(page: number, search: string) {
  return useQuery({
    queryKey: ["materials", page, search],
    queryFn: () => listMaterials({ page, search: search || undefined }),
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialInput) => createMaterial(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast.success("Material created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create material"),
  });
}

export function useUpdateMaterial(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMaterialInput) => updateMaterial(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast.success("Material updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update material"),
  });
}
