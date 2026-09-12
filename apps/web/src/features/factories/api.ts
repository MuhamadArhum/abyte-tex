import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";
import type {
  CreateDepartmentInput,
  CreateFactoryInput,
  CreateWarehouseInput,
  Department,
  Factory,
  Location,
  UpdateFactoryInput,
  Warehouse,
} from "./types";

export function listFactories(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<Factory[]>(`/factories?${qs}`) as Promise<{ data: Factory[]; meta: PaginatedMeta }>;
}

export function getFactory(id: string) {
  return api.get<Factory>(`/factories/${id}`);
}

export function createFactory(input: CreateFactoryInput) {
  return api.post<Factory>("/factories", input);
}

export function updateFactory(id: string, input: UpdateFactoryInput) {
  return api.patch<Factory>(`/factories/${id}`, input);
}

export function listDepartments(factoryId: string) {
  return api.get<Department[]>(`/factories/${factoryId}/departments`);
}

export function createDepartment(factoryId: string, input: CreateDepartmentInput) {
  return api.post<Department>(`/factories/${factoryId}/departments`, input);
}

export function listWarehouses(factoryId: string) {
  return api.get<Warehouse[]>(`/factories/${factoryId}/warehouses`);
}

export function createWarehouse(factoryId: string, input: CreateWarehouseInput) {
  return api.post<Warehouse>(`/factories/${factoryId}/warehouses`, input);
}

export function listLocations(factoryId: string, warehouseId: string) {
  return api.get<Location[]>(`/factories/${factoryId}/warehouses/${warehouseId}/locations`);
}

export function createLocation(factoryId: string, warehouseId: string, input: { code: string; name: string; rack?: string; bin?: string }) {
  return api.post<Location>(`/factories/${factoryId}/warehouses/${warehouseId}/locations`, input);
}
