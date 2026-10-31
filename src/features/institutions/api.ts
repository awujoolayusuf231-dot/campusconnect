import { supabase } from "@/lib/supabase";

export interface InstitutionOption { id: string; name: string; short_name: string | null; type: string }

export async function listActiveInstitutions(): Promise<InstitutionOption[]> {
  const pageSize = 1000;
  const institutions: InstitutionOption[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("institutions")
      .select("id,name,short_name,type")
      .eq("is_active", true)
      .order("name")
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []) as InstitutionOption[];
    institutions.push(...page);
    if (page.length < pageSize) return institutions;
  }
}
