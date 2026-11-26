import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPostImage: vi.fn() }));
vi.mock("../api", () => ({ fetchPostImage: mocks.fetchPostImage }));

import { ProtectedPostImage } from "./ProtectedPostImage";

const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;
const createObjectURLMock = vi.fn(() => "blob:protected-post-image");
const revokeObjectURLMock = vi.fn();

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds = [0];
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.rootMargin = options?.rootMargin ?? "0px";
  }

  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  showAll() {
    this.callback(Array.from(this.targets, (target) => ({
      target,
      isIntersecting: true,
      intersectionRatio: 1,
    } as IntersectionObserverEntry)), this);
  }
}

const observers: TestIntersectionObserver[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  observers.length = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURLMock });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURLMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
});

describe("ProtectedPostImage", () => {
  it("waits until an image nears the viewport before fetching it", async () => {
    mocks.fetchPostImage.mockResolvedValue(new Blob(["protected image"], { type: "image/png" }));
    vi.stubGlobal("IntersectionObserver", class extends TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options);
        observers.push(this);
      }
    });

    const view = render(<ProtectedPostImage path="owner/photo.png" />);

    expect(mocks.fetchPostImage).not.toHaveBeenCalled();
    expect(observers[0]?.rootMargin).toBe("300px 0px");
    observers[0]?.showAll();
    expect(await screen.findByRole("img", { name: "Attached to post" })).toHaveAttribute(
      "src",
      "blob:protected-post-image",
    );
    expect(mocks.fetchPostImage).toHaveBeenCalledTimes(1);
    view.unmount();
  });

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
