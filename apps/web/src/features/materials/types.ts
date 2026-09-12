export type MaterialType = "YARN" | "COTTON" | "CHEMICAL" | "DYE" | "PACKING" | "ACCESSORY" | "CONSUMABLE" | "OTHER";
export type MaterialStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";

export interface Material {
  id: string;
  code: string;
  name: string;
  type: MaterialType;
  unit: string;
  reorderLevel: string | null;
  status: MaterialStatus;
  createdAt: string;
}

export interface CreateMaterialInput {
  code: string;
  name: string;
  type: MaterialType;
  unit: string;
  reorderLevel?: number;
}

export type UpdateMaterialInput = Partial<Omit<CreateMaterialInput, "code">> & { status?: MaterialStatus };

export const MATERIAL_TYPES: MaterialType[] = ["YARN", "COTTON", "CHEMICAL", "DYE", "PACKING", "ACCESSORY", "CONSUMABLE", "OTHER"];
