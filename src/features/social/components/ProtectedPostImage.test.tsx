import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPostImage: vi.fn() }));
vi.mock("../api", () => ({ fetchPostImage: mocks.fetchPostImage }));

import { ProtectedPostImage } from "./ProtectedPostImage";

const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;
const createObjectURLMock = vi.fn(() => "blob:protected-post-image");
const revokeObjectURLMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURLMock });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURLMock });
});

afterEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
});

describe("ProtectedPostImage", () => {
  it("renders fetched bytes through a temporary object URL and revokes it on unmount", async () => {
    mocks.fetchPostImage.mockResolvedValue(new Blob(["protected image"], { type: "image/png" }));

    const view = render(<ProtectedPostImage path="owner/photo.png" />);

    expect(await screen.findByRole("img", { name: "Attached to post" })).toHaveAttribute(
      "src",
      "blob:protected-post-image",
    );
    expect(mocks.fetchPostImage).toHaveBeenCalledWith("owner/photo.png", expect.any(AbortSignal));
    view.unmount();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:protected-post-image");
  });

  it("does not render a URL when the image request is denied", async () => {
    mocks.fetchPostImage.mockRejectedValue(new Error("not available"));

    render(<ProtectedPostImage path="owner/photo.png" />);

    expect(await screen.findByRole("img", { name: "Attached image unavailable" })).toHaveTextContent(
      "Image unavailable",
    );
  });
});
