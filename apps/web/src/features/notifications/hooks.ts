import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "./api";

export function useNotifications(unreadOnly?: boolean) {
  return useQuery({
    queryKey: ["notifications", unreadOnly ?? false],
    queryFn: () => listNotifications({ page: 1, unreadOnly }),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
