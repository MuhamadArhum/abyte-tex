import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";
import type { CreateProductInput, Product, ProductCategory, UpdateProductInput } from "./types";

export function listProducts(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<Product[]>(`/products?${qs}`) as Promise<{ data: Product[]; meta: PaginatedMeta }>;
}

export function getProduct(id: string) {
  return api.get<Product>(`/products/${id}`);
}

export function createProduct(input: CreateProductInput) {
  return api.post<Product>("/products", input);
}

export function updateProduct(id: string, input: UpdateProductInput) {
  return api.patch<Product>(`/products/${id}`, input);
}

export function listProductCategories() {
  return api.get<ProductCategory[]>("/products/categories");
}

export function createProductCategory(input: { name: string; parentId?: string }) {
  return api.post<ProductCategory>("/products/categories", input);
}
