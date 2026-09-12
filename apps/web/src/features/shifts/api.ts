import { api } from "@/lib/api-client";

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface CreateShiftInput {
  name: string;
  startTime: string;
  endTime: string;
}

export function listShifts(factoryId: string) {
  return api.get<Shift[]>(`/factories/${factoryId}/shifts`);
}

export function createShift(factoryId: string, input: CreateShiftInput) {
  return api.post<Shift>(`/factories/${factoryId}/shifts`, input);
}

export function updateShift(factoryId: string, id: string, input: Partial<CreateShiftInput>) {
  return api.patch<Shift>(`/factories/${factoryId}/shifts/${id}`, input);
}
