export type TenantStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  currency: string;
  createdAt: string;
}

export interface CreateTenantInput {
  companyName: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
}
