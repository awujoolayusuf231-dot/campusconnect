import { supabase } from "@/lib/supabase";

export type FeatureReportTarget = "project" | "project_user" | "competition" | "voice_room" | "voice_participant";

export async function submitFeatureReport(targetType: FeatureReportTarget, targetId: string, reason: string) {
  const { error } = await supabase.from("feature_reports").insert({
    target_type: targetType,
    target_id: targetId,
    reason: reason.trim(),
  });
  if (error) throw error;
}
