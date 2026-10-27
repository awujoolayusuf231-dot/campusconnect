import { supabase } from "@/lib/supabase";

export interface InstitutionOption { id: string; name: string; short_name: string | null; type: string }

export async function listActiveInstitutions(): Promise<InstitutionOption[]> {
  const { data, error } = await supabase.from("institutions").select("id,name,short_name,type").eq("is_active", true).order("name").limit(500);
  if (error) throw error;
  return (data ?? []) as InstitutionOption[];
}
