import { useSyncExternalStore } from "react";

export const MOBILE_QUERY = "(max-width: 767px)";

function getSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(MOBILE_QUERY);
  const onChange = () => onStoreChange();

  media.addEventListener?.("change", onChange);
  // Safari < 14 fallback
  media.addListener?.(onChange);

  return () => {
    media.removeEventListener?.("change", onChange);
    media.removeListener?.(onChange);
  };
}

/**
 * Returns true when viewport matches the mobile breakpoint.
 * Initial value is read synchronously from matchMedia and index.html seeds
 * `document.documentElement.dataset.mobile` before React loads to avoid a
 * mobile/desktop layout flash on first paint.
 */
export function useMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
