import { api } from "@/lib/api-client";
import type { PaginatedMeta } from "@abytetex/types";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export function listNotifications(params: { page: number; unreadOnly?: boolean }) {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
  if (params.unreadOnly) qs.set("unreadOnly", "true");
  return api.get<Notification[]>(`/notifications?${qs}`) as Promise<{ data: Notification[]; meta: PaginatedMeta }>;
}

export function markNotificationRead(id: string) {
  return api.patch(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.patch("/notifications/read-all");
}
