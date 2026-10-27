import { supabase } from "@/lib/supabase";

export interface InstitutionOption { id: string; name: string; short_name: string | null; type: string }

export async function listActiveInstitutions(): Promise<InstitutionOption[]> {
  const all: InstitutionOption[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("institutions")
      .select("id,name,short_name,type")
      .eq("is_active", true)
      .order("name")
      .range(from, from + 999);
    if (error) throw error;
    const batch = (data ?? []) as InstitutionOption[];
    all.push(...batch);
    if (batch.length < 1000) return all;
  }
}
