import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const LINK_PATTERN = /(^|[^\p{L}\p{M}\p{N}_&/#])#([A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF][A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F]{1,49})(?![\p{L}\p{M}\p{N}_])|(^|[^\p{L}\p{M}\p{N}_.@])@([A-Za-z0-9][A-Za-z0-9_.-]{1,29})(?![A-Za-z0-9_.-])/gu;
const LATIN_LETTER = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]/;

export function postBodyWithLinks(body: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  LINK_PATTERN.lastIndex = 0;

  while ((match = LINK_PATTERN.exec(body)) !== null) {
    const hashtag = match[2];
    const mention = match[4];
    if (hashtag && !LATIN_LETTER.test(hashtag)) continue;

    const boundary = hashtag ? match[1] ?? "" : match[3] ?? "";
    const tagStart = match.index + boundary.length;
    nodes.push(body.slice(last, tagStart));
    if (hashtag) {
      nodes.push(
        <Link
          key={`${tagStart}-#${hashtag}`}
          to={`/app/tags/${encodeURIComponent(hashtag.normalize("NFC").toLowerCase())}`}
          className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          aria-label={`View posts tagged ${hashtag}`}
        >
          #{hashtag}
        </Link>,
      );
      last = tagStart + hashtag.length + 1;
    } else if (mention) {
      nodes.push(
        <Link
          key={`${tagStart}-@${mention}`}
          to={`/app/u/${encodeURIComponent(mention)}`}
          className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          aria-label={`View @${mention}'s profile`}
        >
          @{mention}
        </Link>,
      );
      last = tagStart + mention.length + 1;
    }
  }

  nodes.push(body.slice(last));
  return nodes;
}

export function PostBody({ body }: { body: string }) {
  return <>{postBodyWithLinks(body)}</>;
}
