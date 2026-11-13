import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Compass, Plus, Search, Users } from "lucide-react";
import { COMMUNITY_CATEGORIES, createCommunity, listCommunities, listMyCommunities, type Community } from "./api";
import { communityCoverUrl } from "./communityCover";
import { socialErrorMessage } from "@/lib/errors";
import { LoadingState } from "@/app/LoadingState";
import { useAuth } from "@/features/auth/AuthProvider";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function CommunitiesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [cat, setCat] = useState(""); const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ["communities", term, cat, page], queryFn: () => listCommunities(term, cat, page) });
  const mine = useQuery({
    queryKey: ["my-communities", session?.user.id],
    enabled: !!session?.user.id,
    queryFn: () => listMyCommunities(session!.user.id),
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setTerm(q.trim());
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="relative overflow-hidden rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-[#fff0ef] p-5 shadow-[0_12px_36px_rgba(35,24,20,0.045)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-primary/10 sm:-right-8 sm:-top-32 sm:h-80 sm:w-80" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#efd9db] bg-white/80 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary shadow-sm"><Compass size={14} aria-hidden="true" /> Find your people</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-fg sm:text-4xl">Campus communities</h1>
            <p className="mt-2 text-sm leading-6 text-muted sm:text-base">Discover groups around your interests, studies, and campus life.</p>
          </div>
          <button className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 font-bold shadow-sm sm:w-auto" onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" /> Create community
          </button>
        </div>
      </header>

      {session && <section aria-labelledby="my-communities-heading" className="space-y-4">
        <div>
          <h2 id="my-communities-heading" className="text-xl font-extrabold tracking-tight text-fg">Your communities</h2>
          <p className="mt-1 text-sm text-muted">Groups you currently belong to.</p>
        </div>
        {mine.isLoading && <LoadingState label="Loading your communities" variant="panel" />}
        {mine.isError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
          Could not load your communities. Try again later.
          <button type="button" className="ml-2 font-bold underline" onClick={() => void mine.refetch()}>Retry</button>
        </div>}
        {mine.data && mine.data.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-muted">You haven’t joined any communities yet. Explore below to find your people.</p>}
        {mine.data && mine.data.length > 0 && <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mine.data.map(({ community, role }, index) => <CommunityCard key={community.id} community={community} index={index} joined myRole={role} />)}
        </ul>}
      </section>}

      <section aria-label="Find a community" className="rounded-2xl border border-line bg-white p-3 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-4">
        <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]" onSubmit={applyFilters}>
          <label className="relative block">
            <span className="sr-only">Search communities</span>
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input min-h-11 w-full pl-10" aria-label="Search communities" placeholder="Search by community name" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select className="input min-h-11 w-full" aria-label="Category" value={cat} onChange={(e) => { setPage(0); setCat(e.target.value); }}>
              <option value="">All categories</option>{COMMUNITY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className="btn-primary min-h-11 rounded-xl px-5 font-bold"><Search size={16} aria-hidden="true" className="mr-2 inline" />Search</button>
        </form>
      </section>

      {list.isLoading && <LoadingState label="Finding communities" variant="panel" />}
      {list.isError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-danger">
        <p className="font-bold">Could not load communities.</p>
        <p className="mt-1">Check your connection and try again.</p>
        <button type="button" className="btn mt-3" onClick={() => void list.refetch()}>Try again</button>
      </div>}
      {list.isSuccess && list.data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0ef] text-primary"><Users size={22} aria-hidden="true" /></span>
          <h2 className="mt-4 text-lg font-extrabold text-fg">{term || cat ? "No communities match those filters" : "No communities yet"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{term || cat ? "Try another search or category to explore more of campus." : "Create a community and bring students together around something you care about."}</p>
          {(term || cat) ? <button className="btn mt-4" onClick={() => { setQ(""); setTerm(""); setCat(""); setPage(0); }}>Clear filters</button>
            : <button className="btn-primary mt-4 min-h-10 rounded-xl px-4 font-bold" onClick={() => setCreating(true)}>Create the first community</button>}
        </div>
      )}

      {list.data && list.data.length > 0 && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-fg">{term || cat ? "Search results" : "Explore communities"} <span className="ml-1 font-medium text-muted">· Page {page + 1}</span></h2>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-muted"><Users size={14} aria-hidden="true" /> Most joined</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((community, index) => {
            const membership = mine.data?.find(({ community: joined }) => joined.id === community.id);
            return <CommunityCard key={community.id} community={community} index={index} joined={!!membership} myRole={membership?.role} />;
          })}
        </ul>
        <nav aria-label="Community pages" className="flex items-center justify-between rounded-2xl border border-line bg-white p-3">
          <button className="btn min-h-10" disabled={page === 0 || list.isFetching} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-xs font-semibold text-muted">Page {page + 1}</span>
          <button className="btn min-h-10" disabled={list.data.length < 20 || list.isFetching} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      </>}
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={(slug) => {
        void qc.invalidateQueries({ queryKey: ["communities"] });
        nav(`/app/c/${slug}`);
      }} />}
    </div>
  );
}

function CommunityCard({ community, index, joined = false, myRole }: { community: Community; index: number; joined?: boolean; myRole?: string }) {
  const cover = useQuery({
    queryKey: ["community-cover", community.id, community.cover_path],
    enabled: !!community.cover_path,
    queryFn: () => communityCoverUrl(community.id, community.cover_path),
  });
  const category = COMMUNITY_CATEGORIES.find(([value]) => value === community.category)?.[1] ?? "Community";
  const gradient = index % 3 === 0
    ? "from-[#741923] via-[#a52432] to-[#df7a80]"
    : index % 3 === 1
      ? "from-[#6d3740] via-[#b54f5d] to-[#efaaa8]"
      : "from-[#8d303b] via-[#c45e68] to-[#f2b8ae]";
  return (
    <li className="group flex min-h-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(35,24,20,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(35,24,20,0.09)]">
      <div className={`relative flex h-36 items-end overflow-hidden bg-gradient-to-br bg-cover bg-center sm:h-40 ${gradient}`}
        style={cover.data ? { backgroundImage: `linear-gradient(to top, rgba(49,16,20,0.2), rgba(49,16,20,0.02)), url("${cover.data}")` } : undefined}>
        {!cover.data && <><div aria-hidden="true" className="absolute -right-7 -top-14 h-36 w-36 rounded-full border border-white/15" /><div aria-hidden="true" className="absolute -right-1 -top-9 h-28 w-28 rounded-full border border-white/10" /></>}
        <span className="relative m-3 rounded-full border border-white/20 bg-black/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.13em] text-white backdrop-blur">{category}</span>
        {community.status === "archived" && <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-fg">Archived</span>}
        {cover.isError && <span role="alert" className="absolute right-3 top-3 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-semibold text-danger">Cover unavailable</span>}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/app/c/${community.slug}`} className="min-w-0 text-lg font-extrabold leading-snug text-fg decoration-primary underline-offset-4 group-hover:underline">{community.name}</Link>
          {joined && <span className="shrink-0 rounded-full bg-[#eef8f0] px-2.5 py-1 text-[10px] font-extrabold text-[#28633a]">Joined</span>}
        </div>
        {myRole && myRole !== "member" && <span className="mt-1 w-fit rounded-full bg-[#fff1ef] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">{myRole}</span>}
        <p className="mt-2 min-h-[3rem] line-clamp-2 text-sm leading-6 text-muted">{community.description || "This community hasn’t added a description yet."}</p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted"><Users size={15} aria-hidden="true" />{community.member_count} member{community.member_count === 1 ? "" : "s"}</span>
          <Link to={`/app/c/${community.slug}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-extrabold text-primary transition hover:bg-[#fff4f2]">
            View community <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const [f, setF] = useState({ name: "", slug: "", description: "", category: "interest" });
  const [slugTouched, setSlugTouched] = useState(false);
  const m = useMutation({ mutationFn: () => createCommunity({ ...f, institution: "" }), onSuccess: () => onCreated(f.slug) });
  const valid = f.name.trim().length >= 3 && /^[a-z0-9][a-z0-9-]{2,39}$/.test(f.slug);
  return (
    createPortal(
      <div role="dialog" aria-modal="true" aria-label="Create community" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-[2px] md:items-center md:p-6" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <form className="card w-full max-w-md space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(); }}>
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Start something together</p><h2 className="mt-1 text-xl font-black">Create a community</h2></div>
          <div><label className="label" htmlFor="cn">Name</label><input id="cn" className="input" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} /></div>
          <div><label className="label" htmlFor="cs">Web address (letters, numbers, dashes)</label><input id="cs" className="input" maxLength={40} value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value.toLowerCase() }); }} /></div>
          <div><label className="label" htmlFor="cc">Category</label><select id="cc" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{COMMUNITY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor="cd">Description (optional)</label><textarea id="cd" className="input" rows={3} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <p className="text-xs leading-5 text-muted">You’ll be the community owner. Communities must follow the guidelines and can be disabled by platform moderators.</p>
          {m.isError && <p role="alert" className="err">{socialErrorMessage(String((m.error as Error).message))}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!valid || m.isPending}>{m.isPending ? "Creating…" : "Create"}</button></div>
        </form>
      </div>,
      document.body,
    )
  );
}
