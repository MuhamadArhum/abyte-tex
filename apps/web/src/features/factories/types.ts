export type FactoryStatus = "ACTIVE" | "INACTIVE";
export type WarehouseType = "RAW_MATERIAL" | "WIP" | "FINISHED_GOODS" | "PACKING" | "GENERAL";

export interface Factory {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: FactoryStatus;
  createdAt: string;
}

export interface CreateFactoryInput {
  code: string;
  name: string;
  address?: string;
  city?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export type UpdateFactoryInput = Partial<Omit<CreateFactoryInput, "code">> & { status?: FactoryStatus };

export interface Department {
  id: string;
  code: string;
  name: string;
  factoryId: string;
}

export interface CreateDepartmentInput {
  code: string;
  name: string;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  rack: string | null;
  bin: string | null;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: WarehouseType;
  address: string | null;
  locations?: Location[];
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  type: WarehouseType;
  address?: string;
}

export const WAREHOUSE_TYPES: WarehouseType[] = ["RAW_MATERIAL", "WIP", "FINISHED_GOODS", "PACKING", "GENERAL"];
