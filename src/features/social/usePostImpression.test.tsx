import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { usePostImpression } from "./usePostImpression";

let intersectionCallback: IntersectionObserverCallback | undefined;
class TestIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [0, 0.5, 1];
}

function ImpressionTarget({ postId }: { postId: string }) {
  const ref = usePostImpression(true, postId);
  return <article ref={ref}>Post</article>;
}

describe("post impression tracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("records only after at least half the post remains visible for one second", async () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><ImpressionTarget postId="post-1" /></QueryClientProvider>);

    act(() => intersectionCallback?.([{ intersectionRatio: 0.49 } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(mocks.rpc).not.toHaveBeenCalled();

    act(() => intersectionCallback?.([{ intersectionRatio: 0.5 } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => { vi.advanceTimersByTime(1050); });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("record_post_impressions", { p_post_ids: ["post-1"] });
  });

  it("cancels the visibility timer when the post leaves the viewport", async () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><ImpressionTarget postId="post-2" /></QueryClientProvider>);

    act(() => intersectionCallback?.([{ intersectionRatio: 0.75 } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => { vi.advanceTimersByTime(700); });
    act(() => intersectionCallback?.([{ intersectionRatio: 0.2 } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
