import { useEffect, useRef, useState } from "react";
import { fetchPostImage } from "../api";

export function ProtectedPostImage({ path }: { path: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let requested = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    let observer: IntersectionObserver | null = null;
    setSrc(null);
    setUnavailable(false);

    const loadImage = () => {
      if (requested) return;
      requested = true;
      void fetchPostImage(path, controller.signal).then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setSrc(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      }).catch(() => {
        if (active) setUnavailable(true);
      });
    };

    if (typeof IntersectionObserver === "undefined" || !containerRef.current) {
      loadImage();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          loadImage();
        }
      }, { rootMargin: "300px 0px" });
      observer.observe(containerRef.current);
    }

    return () => {
      active = false;
      observer?.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return (
    <div ref={containerRef}>
      {src
        ? <img src={src} alt="Attached to post" loading="lazy" decoding="async" draggable={false} className="max-h-[min(70vh,34rem)] w-full rounded-xl border border-line/60 bg-bg object-cover" />
        : <div role="img" aria-label="Attached image unavailable" className="flex min-h-24 items-center justify-center rounded-xl border border-line/60 bg-bg text-sm text-muted">
            {unavailable ? "Image unavailable" : "Loading image…"}
          </div>}
    </div>
  );
}
