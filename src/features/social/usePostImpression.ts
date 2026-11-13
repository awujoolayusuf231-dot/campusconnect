import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

const pendingPostIds = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueueImpression(postId: string): void {
  pendingPostIds.add(postId);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const ids = [...pendingPostIds];
    pendingPostIds.clear();
    void submitImpressions(ids);
  }, 50);
}

async function submitImpressions(postIds: string[]): Promise<void> {
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
}

export function usePostImpression(enabled: boolean, postId: string) {
  const target = useRef<HTMLElement | null>(null);
  const recorded = useRef(false);

  useEffect(() => {
    const element = target.current;
    if (!enabled || !element || recorded.current || typeof IntersectionObserver === "undefined") return;

    let visibleTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry || entry.intersectionRatio < 0.5) {
        if (visibleTimer) clearTimeout(visibleTimer);
        visibleTimer = null;
        return;
      }
      if (visibleTimer || recorded.current) return;
      visibleTimer = setTimeout(() => {
        visibleTimer = null;
        recorded.current = true;
        enqueueImpression(postId);
      }, 1000);
    }, { threshold: [0, 0.5, 1] });

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (visibleTimer) clearTimeout(visibleTimer);
    };
  }, [enabled, postId]);

  return target;
}
