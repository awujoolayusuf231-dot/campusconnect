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
  return "The action failed. Please try again.";
}

export function socialErrorMessage(message: string): string {
  if (message.includes("rate_limited")) return "You are doing that too quickly. Please try again later.";
  if (message.includes("cannot_repost_own")) return "You cannot repost your own post.";
  if (message.includes("cannot_repost_community_post")) return "Posts inside communities cannot be reposted.";
  if (message.includes("not_found")) return "That item is no longer available.";
  if (message.includes("forbidden")) return "Your account cannot do that right now.";
  if (message.includes("name_or_slug_taken")) return "That name or web address is already taken.";
  if (message.includes("banned")) return "You have been removed from this community.";
  if (message.includes("owner_cannot_leave")) return "Owners cannot leave. Archive the community instead.";
  if (message.includes("feature_disabled")) return "This feature is currently switched off.";
  if (message.includes("not_restorable")) return "This was removed by platform moderators and cannot be restored here.";
  if (message.includes("insufficient_role")) return "You do not have enough permissions for that.";
  if (message.includes("too_many_communities")) return "You already own the maximum number of communities.";
  if (message.includes("invalid_body")) return "Please enter between 1 and 1000 characters.";
  if (message.includes("cannot_report_self")) return "You cannot report your own content.";
  if (message.includes("row-level security") || message.includes("permission denied")) return "You are not allowed to do that.";
  return "Something went wrong. Please try again.";
}
