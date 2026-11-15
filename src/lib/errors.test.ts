import { describe, expect, it } from "vitest";
import { socialErrorMessage } from "./errors";

describe("socialErrorMessage", () => {
  it("explains when community cover storage is missing", () => {
    const message = "Community cover storage is not set up. Apply migration 20261111000016_community_management.sql in Supabase.";

    expect(socialErrorMessage(message)).toBe(message);
  });

  it("preserves actionable cover upload authorization guidance", () => {
    const message = "Supabase denied this cover upload. Confirm you are the active community owner and migration 20261112000018_enforce_community_settings_managers.sql is applied.";

    expect(socialErrorMessage(message)).toBe(message);
  });

  it("preserves the storage policy diagnosis after owner checks pass", () => {
    const message = "Storage denied the cover upload even though the app verified an active owner account that can post. Check the community-covers INSERT policies, especially community_covers_insert_manager.";

    expect(socialErrorMessage(message)).toBe(message);
  });

  it("does not expose raw storage errors", () => {
    expect(socialErrorMessage("Community cover upload failed: internal storage error")).toBe(
      "Could not upload the community cover. Check your connection and try again.",
    );
  });

  it("explains when a cover cannot be linked or its institution is inactive", () => {
    expect(socialErrorMessage("cover_not_found")).toContain("select the image again");
    expect(socialErrorMessage("invalid_institution")).toContain("Choose an active institution");
  });
});
