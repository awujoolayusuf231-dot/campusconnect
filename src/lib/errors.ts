// Map backend errors to safe, user-friendly text. Never echo raw database errors to students.
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please verify your email first. Check your inbox.";
  if (m.includes("registration_closed")) return "Registration is currently closed.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("password")) return "That password was not accepted. Use at least 8 characters.";
  return "Something went wrong. Please try again.";
}
export function adminErrorMessage(message: string): string {
  if (message.includes("forbidden")) return "You do not have permission to do that.";
  if (message.includes("insufficient_rank")) return "You cannot act on an account with equal or higher rank.";
  if (message.includes("cannot_moderate_self")) return "You cannot moderate your own account.";
  if (message.includes("reason_required")) return "Please enter a reason (at least 5 characters).";
  if (message.includes("direct_deletion_only_available_for_student_accounts")) return "Only student accounts can be deleted from this page.";
  if (message.includes("cannot_delete_self_or_missing_target") || message.includes("target_not_found")) return "That account is no longer available. Refresh the users list and try again.";
  if (message.includes("pending_deletion_request_not_found")) return "The deletion request could not be approved. Confirm the latest account-deletion migration is applied.";
  if (message.includes("account_deletion_not_configured")) return "The account deletion function is missing Supabase configuration. Check its deployed server settings.";
  if (message.includes("account_deletion_failed_request_restored")) return "Supabase could not delete the account, so the deletion request was restored. Check the Edge Function logs.";
  if (message.includes("account_deletion_failed_request_restore_failed")) return "Deletion failed and its request could not be restored. Check the Edge Function logs and request status before retrying.";
  if (message.includes("unauthorized")) return "Your session could not be verified. Sign in again and retry.";
  if (message.includes("PGRST202")) return "The account-deletion RPC is missing from the database schema cache. Confirm the migration is applied, then reload the schema cache.";
  return "The action failed. Please try again.";
}

export function socialErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("community cover storage is not set up")) return message;
  if (normalized.includes("supabase denied this cover upload")) return message;
  if (normalized.includes("storage denied the cover upload")) return message;
  if (normalized.includes("could not verify community cover permissions")) return message;
  if (normalized.includes("only an active community owner can upload")) return message;
  if (normalized.includes("currently unable to post, so it cannot upload a community cover")) return message;
  if (normalized.includes("community cover upload failed")) {
    return "Could not upload the community cover. Check your connection and try again.";
  }
  if (normalized.includes("cover_not_found") || normalized.includes("invalid_cover_path")) {
    return "The cover upload could not be linked to this community. Please select the image again and save.";
  }
  if (normalized.includes("invalid_institution")) return "The selected institution is no longer available. Choose an active institution or clear the selection.";
  if (normalized.includes("disabled_by_platform")) return "This community has been disabled and can no longer be updated.";
  if (normalized.includes("rate_limited")) return "You are doing that too quickly. Please try again later.";
  if (normalized.includes("cannot_repost_own")) return "You cannot repost your own post.";
  if (normalized.includes("cannot_repost_community_post")) return "Posts inside communities cannot be reposted.";
  if (normalized.includes("comment_not_publicly_reshareable")) return "Only comments on public, non-community posts can be reshared.";
  if (normalized.includes("invalid_parent_comment")) return "Replies can only be added directly under a top-level comment.";
  if (normalized.includes("not_found")) return "That item is no longer available.";
  if (normalized.includes("forbidden")) return "Your account cannot do that right now.";
  if (normalized.includes("name_or_slug_taken") || normalized.includes("name_taken")) return "That name or web address is already taken.";
  if (normalized.includes("banned")) return "You have been removed from this community.";
  if (normalized.includes("owner_cannot_leave")) return "Owners cannot leave. Archive the community instead.";
  if (normalized.includes("feature_disabled")) return "This feature is currently switched off.";
  if (normalized.includes("not_restorable")) return "This was removed by platform moderators and cannot be restored here.";
  if (normalized.includes("insufficient_role")) return "You do not have enough permissions for that.";
  if (normalized.includes("too_many_communities")) return "You already own the maximum number of communities.";
  if (normalized.includes("invalid_body")) return "Please enter between 1 and 1000 characters.";
  if (normalized.includes("cannot_report_self")) return "You cannot report your own content.";
  if (normalized.includes("row-level security") || normalized.includes("permission denied")) return "You are not allowed to do that.";
  return "Something went wrong. Please try again.";
}
