export type PartyStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: string | null;
  rating: number | null;
  status: PartyStatus;
  createdAt: string;
  purchaseOrders?: Array<{ id: string; poNumber: string; status: string; total: string; orderDate: string }>;
}

export interface CreateSupplierInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  rating?: number;
}

export type UpdateSupplierInput = Partial<CreateSupplierInput> & { status?: PartyStatus };
