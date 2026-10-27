import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PublicSettings { platform_name: string; registration_open: boolean; maintenance_message: string; announcement_banner: string; support_email: string; guidelines_url: string }
export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = { platform_name: "CampusConnect", registration_open: true, maintenance_message: "", announcement_banner: "", support_email: "", guidelines_url: "/community-guidelines" };

// Reads only settings flagged is_public in the database (anonymous read is allowed for those rows only).
export function parsePublicSettings(rows: { key: string; value: unknown }[]): PublicSettings {
  const out: Record<string, unknown> = { ...DEFAULT_PUBLIC_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_PUBLIC_SETTINGS && typeof r.value === typeof (DEFAULT_PUBLIC_SETTINGS as unknown as Record<string, unknown>)[r.key]) out[r.key] = r.value;
  return out as unknown as PublicSettings;
}
export function usePublicSettings() {
  return useQuery({ queryKey: ["public-settings"], staleTime: 60_000, queryFn: async () => {
    const { data, error } = await supabase.from("platform_settings").select("key,value");
    if (error) return DEFAULT_PUBLIC_SETTINGS; // fail open to defaults; the database still enforces registration rules
    return parsePublicSettings((data ?? []) as { key: string; value: unknown }[]); } });
}
