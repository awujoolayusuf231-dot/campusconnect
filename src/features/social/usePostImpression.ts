import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { recordPostViews } from "./api";

const pendingPostIds = new Set<string>();
const pendingPostViews = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueueImpression(postId: string): void {
  pendingPostIds.add(postId);
  scheduleFlush();
}

function enqueuePostView(postId: string, dwellMs: number): void {
  if (dwellMs <= 0) return;
  pendingPostViews.set(postId, (pendingPostViews.get(postId) ?? 0) + dwellMs);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const ids = [...pendingPostIds];
    const views = [...pendingPostViews].map(([postId, dwellMs]) => ({ postId, dwellMs }));
    pendingPostIds.clear();
    pendingPostViews.clear();
    void submitBatch(ids, views);
  }, 50);
}

async function submitBatch(postIds: string[], views: { postId: string; dwellMs: number }[]): Promise<void> {
  for (let start = 0; start < postIds.length; start += 50) {
    try {
      const { error } = await supabase.rpc("record_post_impressions", {
        p_post_ids: postIds.slice(start, start + 50),
      });
      if (error) console.error("Could not record post impressions.", error);
    } catch (error) {
      console.error("Could not record post impressions.", error);
    }
  }
  try {
    await recordPostViews(views);
  } catch (error) {
    console.error("Could not record post views.", error);
  }
}

export function usePostImpression(enabled: boolean, postId: string) {
  const target = useRef<HTMLElement | null>(null);
  const recorded = useRef(false);

  useEffect(() => {
    const element = target.current;
    if (!enabled || !element || recorded.current || typeof IntersectionObserver === "undefined") return;

    let visibleTimer: ReturnType<typeof setTimeout> | null = null;
    let dwellTimer: ReturnType<typeof setInterval> | null = null;
    let lastDwellFlush = 0;
    let isVisible = false;
    const flushDwell = () => {
      if (recorded.current && lastDwellFlush > 0) {
        const now = Date.now();
        enqueuePostView(postId, now - lastDwellFlush);
        lastDwellFlush = now;
      }
    };
    const stopDwell = () => {
      if (dwellTimer) clearInterval(dwellTimer);
      dwellTimer = null;
      flushDwell();
      lastDwellFlush = 0;
    };
    const stopTracking = () => {
      if (visibleTimer) clearTimeout(visibleTimer);
      visibleTimer = null;
      stopDwell();
    };
    const startTracking = () => {
      if (!isVisible || document.visibilityState !== "visible") return;
      if (recorded.current) {
        if (dwellTimer) return;
        lastDwellFlush = Date.now();
        dwellTimer = setInterval(flushDwell, 10000);
        return;
      }
      if (visibleTimer) return;
      visibleTimer = setTimeout(() => {
        visibleTimer = null;
        if (!isVisible || document.visibilityState !== "visible") return;
        recorded.current = true;
        enqueueImpression(postId);
        enqueuePostView(postId, 1000);
        lastDwellFlush = Date.now();
        dwellTimer = setInterval(flushDwell, 10000);
      }, 1000);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") startTracking();
      else stopTracking();
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry || entry.intersectionRatio < 0.5) {
        isVisible = false;
        stopTracking();
        return;
      }
      if (isVisible) return;
      isVisible = true;
      startTracking();
    }, { threshold: [0, 0.5, 1] });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopTracking();
    };
  }, [enabled, postId]);

  return target;
}
