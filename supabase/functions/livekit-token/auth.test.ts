import { describe, expect, it, vi } from "vitest";
import { authenticateSupabaseUser, getBearerToken } from "./auth";

describe("LiveKit token user authentication", () => {
  it("extracts a non-empty bearer token and rejects missing credentials", () => {
    expect(getBearerToken("Bearer access-token")).toBe("access-token");
    expect(getBearerToken(null)).toBeNull();
    expect(getBearerToken("Bearer ")).toBeNull();
    expect(getBearerToken("Basic access-token")).toBeNull();
  });

  it("validates the supplied user access token and returns only the authenticated identity", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "authenticated-user" } },
      error: null,
    });

    const authentication = await authenticateSupabaseUser("user-access-token", { auth: { getUser } });

    expect(getUser).toHaveBeenCalledWith("user-access-token");
    expect(authentication).toEqual({ ok: true, user: { id: "authenticated-user" } });
  });

  it("rejects expired or otherwise invalid access tokens", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { code: "session_expired", status: 401 },
    });

    await expect(authenticateSupabaseUser("expired-access-token", { auth: { getUser } })).resolves.toEqual({
      ok: false,
      reason: "invalid_token",
      code: "session_expired",
      status: 401,
    });
  });
});
