const VERIFIED_USERNAMES = new Set(["dewalexict", "ampus_onnect"]);

export function isVerifiedUsername(username: string | null | undefined): boolean {
  const normalized = username?.trim().replace(/^@/, "").toLowerCase();
  return normalized ? VERIFIED_USERNAMES.has(normalized) : false;
}
