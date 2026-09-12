import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  createDepartment,
  createFactory,
  createLocation,
  createWarehouse,
  getFactory,
  listDepartments,
  listFactories,
  listLocations,
  listWarehouses,
  updateFactory,
} from "./api";
import type { CreateDepartmentInput, CreateFactoryInput, CreateWarehouseInput, UpdateFactoryInput } from "./types";

export function useFactories(page: number, search: string) {
  return useQuery({
    queryKey: ["factories", page, search],
    queryFn: () => listFactories({ page, search: search || undefined }),
  });
}

export function useFactory(id: string) {
  return useQuery({ queryKey: ["factories", id], queryFn: () => getFactory(id), enabled: !!id });
}

export function useCreateFactory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFactoryInput) => createFactory(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factories"] });
      toast.success("Factory created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create factory"),
  });
}

export function useUpdateFactory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFactoryInput) => updateFactory(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factories"] });
      toast.success("Factory updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update factory"),
  });
}

export function useDepartments(factoryId: string) {
  return useQuery({ queryKey: ["departments", factoryId], queryFn: () => listDepartments(factoryId), enabled: !!factoryId });
}

export function useCreateDepartment(factoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepartmentInput) => createDepartment(factoryId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments", factoryId] });
      toast.success("Department created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create department"),
  });
}

export function useWarehouses(factoryId: string) {
  return useQuery({ queryKey: ["warehouses", factoryId], queryFn: () => listWarehouses(factoryId), enabled: !!factoryId });
}

export function useCreateWarehouse(factoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => createWarehouse(factoryId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses", factoryId] });
      toast.success("Warehouse created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create warehouse"),
  });
}

export function useLocations(factoryId: string, warehouseId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["locations", warehouseId],
    queryFn: () => listLocations(factoryId, warehouseId),
    enabled: enabled && !!warehouseId,
  });
}

export function useCreateLocation(factoryId: string, warehouseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; name: string; rack?: string; bin?: string }) => createLocation(factoryId, warehouseId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations", warehouseId] });
      toast.success("Location added");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add location"),
  });
}
