import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createSupplier, listSuppliers, updateSupplier } from "./api";
import type { CreateSupplierInput, UpdateSupplierInput } from "./types";

export function useSuppliers(page: number, search: string) {
  return useQuery({
    queryKey: ["suppliers", page, search],
    queryFn: () => listSuppliers({ page, search: search || undefined }),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => createSupplier(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create supplier"),
  });
}

export function useUpdateSupplier(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSupplierInput) => updateSupplier(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update supplier"),
  });
}
