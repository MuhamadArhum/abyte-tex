import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  createProduct,
  createProductCategory,
  getProduct,
  listProductCategories,
  listProducts,
  updateProduct,
} from "./api";
import type { CreateProductInput, UpdateProductInput } from "./types";

export function useProducts(page: number, search: string) {
  return useQuery({
    queryKey: ["products", page, search],
    queryFn: () => listProducts({ page, search: search || undefined }),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => getProduct(id!),
    enabled: !!id,
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: ["product-categories"],
    queryFn: () => listProductCategories(),
  });
}

export function useCreateProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProductCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-categories"] });
      toast.success("Category created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create category"),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create product"),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProductInput) => updateProduct(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update product"),
  });
}
