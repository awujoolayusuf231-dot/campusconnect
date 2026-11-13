import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
    storage: { from: () => ({ remove: mocks.remove }) },
  },
}));

import { deleteAssignmentDiscussionReply } from "./api";

describe("assignment discussion API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures reply attachments before soft deletion, then removes their files and metadata", async () => {
    const order: string[] = [];
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.rpc.mockImplementation(async () => {
      order.push("soft-delete");
      return { error: null };
    });
    mocks.remove.mockImplementation(async () => {
      order.push("remove-files");
      return { error: null };
    });
    mocks.from.mockImplementationOnce(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        then: (resolve: (result: unknown) => unknown) => {
          order.push("read-attachments");
          return Promise.resolve({
            data: [{ id: "attachment-1", object_path: "user-1/discussion-1/file.pdf" }],
            error: null,
          }).then(resolve);
        },
      };
      return query;
    }).mockImplementationOnce(() => ({
      delete: () => ({
        in: () => {
          order.push("delete-metadata");
          return Promise.resolve({ error: null });
        },
      }),
    }));

    await deleteAssignmentDiscussionReply("reply-1", "discussion-1");

    expect(order).toEqual(["read-attachments", "soft-delete", "remove-files", "delete-metadata"]);
    expect(mocks.remove).toHaveBeenCalledWith(["user-1/discussion-1/file.pdf"]);
  });
});
