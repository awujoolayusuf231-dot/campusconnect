import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/features/community/api", () => ({
  listMyCommunities: vi.fn(),
}));

import { getVoiceToken, syncVoiceRoomPermissions } from "./api";

describe("syncVoiceRoomPermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains how to resolve an unreachable room-control function", async () => {
    const fetchError = Object.assign(new Error("Failed to send a request to the Edge Function"), {
      name: "FunctionsFetchError",
    });
    mocks.invoke.mockResolvedValue({ error: fetchError });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(syncVoiceRoomPermissions("room-1")).rejects.toThrow(
      "Confirm it is deployed to this Supabase project with the current CORS and gateway JWT settings.",
    );
    expect(mocks.invoke).toHaveBeenCalledWith("livekit-room-control", { body: { room_id: "room-1" } });
  });

  it("preserves errors returned by the room-control function", async () => {
    const functionError = new Error("room_manager_required");
    mocks.invoke.mockResolvedValue({ error: functionError });

    await expect(syncVoiceRoomPermissions("room-1")).rejects.toBe(functionError);
  });
});

describe("getVoiceToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the server-minted token without accepting a client-selected identity", async () => {
    const token = { url: "wss://livekit.example", token: "server-minted-token" };
    mocks.invoke.mockResolvedValue({ data: token, error: null });

    await expect(getVoiceToken("room-1", true)).resolves.toEqual(token);
    expect(mocks.invoke).toHaveBeenCalledWith("livekit-token", {
      body: { room_id: "room-1", can_publish: true },
    });
  });

  it("explains when LiveKit secrets are missing from the Edge Function", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: "livekit_not_configured" }), { status: 503 })),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getVoiceToken("room-1", true)).rejects.toThrow(
      "Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET",
    );
    expect(mocks.invoke).toHaveBeenCalledWith("livekit-token", { body: { room_id: "room-1", can_publish: true } });
  });

  it("points to the required host-controls migration when speaker authorization fails", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: "speaker_permission_required" }), { status: 403 })),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getVoiceToken("room-1", true)).rejects.toThrow("Confirm migration 20261115000035 is applied");
  });

  it("asks the user to refresh after Supabase rejects an expired session", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getVoiceToken("room-1", true)).rejects.toThrow("Refresh your session or sign in again");
  });
});
