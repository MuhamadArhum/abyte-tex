export interface ProductCategory {
  id: string;
  name: string;
  parentId: string | null;
}

export type ProductStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";

export interface Product {
  id: string;
  sku: string;
  code: string | null;
  name: string;
  categoryId: string | null;
  category: ProductCategory | null;
  unit: string;
  fabricType: string | null;
  gsm: number | null;
  width: number | null;
  color: string | null;
  shade: string | null;
  composition: string | null;
  brand: string | null;
  status: ProductStatus;
  createdAt: string;
}

export interface CreateProductInput {
  sku: string;
  code?: string;
  name: string;
  categoryId?: string;
  unit: string;
  fabricType?: string;
  gsm?: number;
  width?: number;
  color?: string;
  shade?: string;
  composition?: string;
  brand?: string;
}

export type UpdateProductInput = Partial<CreateProductInput> & { status?: ProductStatus };
