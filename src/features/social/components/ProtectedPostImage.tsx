import { useEffect, useState } from "react";
import { fetchPostImage } from "../api";

export function ProtectedPostImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setSrc(null);
    setUnavailable(false);

    void fetchPostImage(path, controller.signal).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setSrc(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {
      if (active) setUnavailable(true);
    });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return src
    ? <img src={src} alt="Attached to post" loading="lazy" className="max-h-[min(70vh,34rem)] w-full rounded-xl border border-line/60 bg-bg object-cover" />
    : <div role="img" aria-label="Attached image unavailable" className="flex min-h-24 items-center justify-center rounded-xl border border-line/60 bg-bg text-sm text-muted">
        {unavailable ? "Image unavailable" : "Loading image…"}
      </div>;
}
