import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export type QualityOutcome = "PASS" | "REWORK" | "HOLD" | "REJECT";
export const QUALITY_OUTCOMES: QualityOutcome[] = ["PASS", "REWORK", "HOLD", "REJECT"];
export type DefectSeverity = "MINOR" | "MAJOR" | "CRITICAL";
export const DEFECT_SEVERITIES: DefectSeverity[] = ["MINOR", "MAJOR", "CRITICAL"];

export interface InspectionTemplate {
  id: string;
  name: string;
  appliesTo: "PRODUCTION_BATCH" | "GOODS_RECEIPT" | "DISPATCH";
  checklistItems: Array<{ label: string; type: string; required?: boolean }>;
}

export interface QualityInspection {
  id: string;
  outcome: QualityOutcome;
  factoryId: string;
  templateId: string | null;
  productionBatchId: string | null;
  goodsReceiptId: string | null;
  salesOrderId: string | null;
  gsm: string | null;
  width: string | null;
  shade: string | null;
  rollLength: string | null;
  weight: string | null;
  colorVariation: string | null;
  stitchingDefects: string | null;
  notes: string | null;
  createdAt: string;
  defects: Array<{ id: string; defectType: string; severity: DefectSeverity; quantity: string | null; notes: string | null }>;
}

export interface CreateInspectionTemplateInput {
  name: string;
  appliesTo: "PRODUCTION_BATCH" | "GOODS_RECEIPT" | "DISPATCH";
  checklistItems: Array<{ label: string; type: string; required?: boolean }>;
}

export interface CreateQualityInspectionInput {
  factoryId: string;
  templateId?: string;
  productionBatchId?: string;
  goodsReceiptId?: string;
  salesOrderId?: string;
  outcome: QualityOutcome;
  gsm?: number;
  width?: number;
  shade?: string;
  rollLength?: number;
  weight?: number;
  colorVariation?: string;
  stitchingDefects?: string;
  notes?: string;
  defects?: Array<{ defectType: string; severity: DefectSeverity; quantity?: number; notes?: string }>;
}

export function listInspectionTemplates() {
  return api.get<InspectionTemplate[]>("/inspection-templates") as Promise<{ data: InspectionTemplate[] }>;
}

export function createInspectionTemplate(input: CreateInspectionTemplateInput) {
  return api.post<InspectionTemplate>("/inspection-templates", input);
}

export function listQualityInspections(params: { page: number; factoryId?: string; outcome?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.factoryId) qs.set("factoryId", params.factoryId);
  if (params.outcome) qs.set("outcome", params.outcome);
  return api.get<QualityInspection[]>(`/quality-inspections?${qs}`) as Promise<{ data: QualityInspection[]; meta: PaginatedMeta }>;
}

export function getQualityInspection(id: string) {
  return api.get<QualityInspection>(`/quality-inspections/${id}`);
}

export function createQualityInspection(input: CreateQualityInspectionInput) {
  return api.post<QualityInspection>("/quality-inspections", input);
}
