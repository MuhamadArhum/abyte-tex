import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createCustomer, listCustomers, updateCustomer } from "./api";
import type { CreateCustomerInput, UpdateCustomerInput } from "./types";

export function useCustomers(page: number, search: string) {
  return useQuery({
    queryKey: ["customers", page, search],
    queryFn: () => listCustomers({ page, search: search || undefined }),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomer(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create customer"),
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCustomerInput) => updateCustomer(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update customer"),
  });
}
