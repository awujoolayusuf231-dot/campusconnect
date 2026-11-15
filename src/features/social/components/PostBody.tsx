import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const HASHTAG_PATTERN = /(^|[^\p{L}\p{M}\p{N}_&/#])#([A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF][A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F]{1,49})(?![\p{L}\p{M}\p{N}_])/gu;
const LATIN_LETTER = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]/;

export function postBodyWithHashtagLinks(body: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  HASHTAG_PATTERN.lastIndex = 0;

  while ((match = HASHTAG_PATTERN.exec(body)) !== null) {
    const boundary = match[1] ?? "";
    const hashtag = match[2] ?? "";
    if (!LATIN_LETTER.test(hashtag)) continue;

    const tagStart = match.index + boundary.length;
    nodes.push(body.slice(last, tagStart));
    nodes.push(
      <Link
        key={`${tagStart}-${hashtag}`}
        to={`/app/tags/${encodeURIComponent(hashtag.normalize("NFC").toLowerCase())}`}
        className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        aria-label={`View posts tagged ${hashtag}`}
      >
        #{hashtag}
      </Link>,
    );
    last = tagStart + hashtag.length + 1;
  }

  nodes.push(body.slice(last));
  return nodes;
}

export function PostBody({ body }: { body: string }) {
  return <>{postBodyWithHashtagLinks(body)}</>;
}
