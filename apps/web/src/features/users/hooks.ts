import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { inviteUser, listUsers, updateUser } from "./api";
import type { InviteUserInput, UpdateUserInput } from "./types";

export function useUsers(page: number, search: string) {
  return useQuery({
    queryKey: ["users", page, search],
    queryFn: () => listUsers({ page, search: search || undefined }),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) => inviteUser(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Invitation sent");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to invite user"),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update user"),
  });
}
