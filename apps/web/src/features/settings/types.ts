export interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  taxNumber: string | null;
  currency: string;
  timezone: string;
  fiscalYearStartMonth: number;
  workingDays: number[];
  workingHoursStart: string;
  workingHoursEnd: string;
}

export interface UpdateTenantSettingsInput {
  name?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  taxNumber?: string;
  currency?: string;
  timezone?: string;
  fiscalYearStartMonth?: number;
  workingDays?: number[];
  workingHoursStart?: string;
  workingHoursEnd?: string;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
