import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

import { listActiveInstitutions } from "./api";

describe("listActiveInstitutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
  });

  it("loads every page instead of truncating large institution lists", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `institution-${index}`,
      name: `Institution ${index}`,
      short_name: null,
      type: "university",
    }));
    const lastPage = [{
      id: "institution-1000",
      name: "Institution 1000",
      short_name: null,
      type: "polytechnic",
    }];
    query.range
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: lastPage, error: null });

    const institutions = await listActiveInstitutions();

    expect(institutions).toHaveLength(1001);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(query.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("surfaces database errors instead of returning a partial list", async () => {
    query.range.mockResolvedValueOnce({ data: null, error: new Error("query failed") });

    await expect(listActiveInstitutions()).rejects.toThrow("query failed");
  });
});
