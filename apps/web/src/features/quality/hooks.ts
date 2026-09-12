import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  createInspectionTemplate,
  createQualityInspection,
  getQualityInspection,
  listInspectionTemplates,
  listQualityInspections,
  type CreateInspectionTemplateInput,
  type CreateQualityInspectionInput,
} from "./api";

export function useInspectionTemplates() {
  return useQuery({ queryKey: ["inspection-templates"], queryFn: () => listInspectionTemplates() });
}

export function useCreateInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInspectionTemplateInput) => createInspectionTemplate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspection-templates"] });
      toast.success("Inspection template created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create template"),
  });
}

export function useQualityInspections(page: number, factoryId?: string, outcome?: string) {
  return useQuery({ queryKey: ["quality-inspections", page, factoryId, outcome], queryFn: () => listQualityInspections({ page, factoryId, outcome }) });
}

export function useQualityInspection(id: string) {
  return useQuery({ queryKey: ["quality-inspections", id], queryFn: () => getQualityInspection(id), enabled: !!id });
}

export function useCreateQualityInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQualityInspectionInput) => createQualityInspection(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-inspections"] });
      toast.success("Inspection recorded");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to record inspection"),
  });
}
