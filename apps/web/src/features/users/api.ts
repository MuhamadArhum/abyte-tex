import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";
import type { InviteUserInput, UpdateUserInput, UserListItem } from "./types";

export function listUsers(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.search) qs.set("search", params.search);
  return api.get<UserListItem[]>(`/users?${qs}`) as Promise<{ data: UserListItem[]; meta: PaginatedMeta }>;
}

export function inviteUser(input: InviteUserInput) {
  return api.post<{ id: string; email: string; status: string }>("/users", input);
}

export function updateUser(id: string, input: UpdateUserInput) {
  return api.patch<UserListItem>(`/users/${id}`, input);
}
