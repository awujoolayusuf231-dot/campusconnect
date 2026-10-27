import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

// Unread badges. Realtime only nudges a refetch; authorization is enforced by RLS on every query.
export function useUnreadCounts() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const notif = useQuery({ queryKey: ["unread", "notifications", uid], enabled: !!uid, refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("unread_notification_count"); if (error) throw error; return Number(data ?? 0); } });
  const msgs = useQuery({ queryKey: ["unread", "messages", uid], enabled: !!uid, refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("unread_message_count"); if (error) throw error; return Number(data ?? 0); } });

  useEffect(() => {
    if (!uid) return;
    const channel = supabase.channel(`counts-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, () => {
        void qc.invalidateQueries({ queryKey: ["unread", "notifications"] }); void qc.invalidateQueries({ queryKey: ["notifications"] }); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void qc.invalidateQueries({ queryKey: ["unread", "messages"] }); void qc.invalidateQueries({ queryKey: ["conversations"] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [uid, qc]);
  return { notifications: notif.data ?? 0, messages: msgs.data ?? 0 };
}
