import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Hash, Search, TrendingUp } from "lucide-react";
import { fetchTrendingHashtags, searchHashtags } from "./api";
import { formatCount } from "@/lib/format";

function hashtagPath(tag: string) {
  return `/app/tags/${encodeURIComponent(tag)}`;
}

export function HashtagDiscovery() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const trending = useQuery({
    queryKey: ["hashtags", "trending"],
    queryFn: () => fetchTrendingHashtags(),
    enabled: !submitted,
  });
  const search = useQuery({
    queryKey: ["hashtags", "search", submitted],
    queryFn: () => searchHashtags(submitted),
    enabled: !!submitted,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(query.trim().replace(/^#+/, ""));
  }

  const suggestions = submitted ? search.data ?? [] : trending.data ?? [];
  const loading = submitted ? search.isLoading : trending.isLoading;
  const error = submitted ? search.error : trending.error;

  return (
    <section aria-labelledby="hashtag-discovery-title" className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1f2] text-primary">
          {submitted ? <Search size={18} aria-hidden="true" /> : <TrendingUp size={18} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Explore campus conversations</p>
          <h2 id="hashtag-discovery-title" className="mt-1 text-lg font-black tracking-tight text-fg">
            {submitted ? `Topics matching “${submitted}”` : "Trending hashtags"}
          </h2>
        </div>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search hashtags</span>
          <Hash size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input min-h-11 rounded-xl pl-9"
            aria-label="Search hashtags"
            placeholder="Search a topic"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="btn-primary min-h-11 justify-center gap-2 rounded-xl px-4 font-bold">
          <Search size={15} aria-hidden="true" /> Search
        </button>
        {submitted && <button type="button" className="btn min-h-11 rounded-xl" onClick={() => { setSubmitted(""); setQuery(""); }}>Trending</button>}
      </form>

      {loading && <p role="status" className="text-sm text-muted">Loading topics…</p>}
      {error && <p role="alert" className="text-sm text-danger">Could not load hashtag discovery. Apply the reviewed hashtag SQL if it is not installed.</p>}
      {!loading && !error && suggestions.length === 0 && (
        <p className="rounded-xl bg-bg px-3 py-4 text-sm text-muted">
          {submitted ? "No public topics match that search yet." : "No public topics are trending yet."}
        </p>
      )}
      {!loading && !error && suggestions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((item) => {
            const count = "authors" in item
              ? `${formatCount(item.authors)} ${item.authors === 1 ? "student" : "students"}`
              : `${formatCount(item.post_count)} ${item.post_count === 1 ? "post" : "posts"}`;
            return (
              <li key={item.tag}>
                <Link
                  to={hashtagPath(item.tag)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#eedbde] bg-[#fff9f8] px-3 text-sm font-bold text-primary transition hover:border-primary/40 hover:bg-[#fff1f2]"
                >
                  <Hash size={14} aria-hidden="true" />{item.tag}
                  <span className="text-[11px] font-medium text-muted">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
