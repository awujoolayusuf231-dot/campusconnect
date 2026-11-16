import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/features/community/api", () => ({
  listMyCommunities: vi.fn(),
}));

import { syncVoiceRoomPermissions } from "./api";

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
