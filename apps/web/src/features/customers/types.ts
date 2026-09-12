export type PartyStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export interface Customer {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  paymentTerms: string | null;
  creditLimit: string | null;
  status: PartyStatus;
  createdAt: string;
}

export interface CreateCustomerInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  paymentTerms?: string;
  creditLimit?: number;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput> & { status?: PartyStatus };
