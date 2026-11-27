import { BadgeCheck } from "lucide-react";
import { isVerifiedUsername } from "./verifiedAccounts";

export function VerifiedBadge({ username }: { username: string | null | undefined }) {
  if (!isVerifiedUsername(username)) return null;

  return (
    <span
      role="img"
      aria-label="CampusConnect verified account"
      title="CampusConnect verified account"
      className="inline-flex shrink-0 align-middle"
    >
      <BadgeCheck size={17} fill="#1877F2" stroke="white" aria-hidden="true" />
    </span>
  );
}
