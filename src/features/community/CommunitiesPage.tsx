import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { COMMUNITY_CATEGORIES, createCommunity, listCommunities } from "./api";
import { socialErrorMessage } from "@/lib/errors";
import { LoadingState } from "@/app/LoadingState";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function CommunitiesPage() {
  const nav = useNavigate();
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [cat, setCat] = useState(""); const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ["communities", term, cat, page], queryFn: () => listCommunities(term, cat, page) });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Communities</h1><button className="btn-primary" onClick={() => setCreating(true)}>Create community</button></div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setTerm(q); }}>
        <input className="input w-full md:w-64" aria-label="Search communities" placeholder="Search communities" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Category" value={cat} onChange={(e) => { setPage(0); setCat(e.target.value); }}><option value="">All categories</option>{COMMUNITY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn-primary">Search</button>
      </form>
      {list.isLoading && <LoadingState label="Finding communities" variant="panel" />}
      {list.isError && <p role="alert" className="err">Could not load communities.</p>}
      {list.data?.length === 0 && <p className="card text-center text-muted">No communities found. Create the first one!</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {list.data?.map((c) => (
          <li key={c.id} className="card"><Link to={`/app/c/${c.slug}`} className="font-medium hover:underline">{c.name}</Link>
            <p className="text-xs text-muted">{COMMUNITY_CATEGORIES.find(([v]) => v === c.category)?.[1]} · {c.member_count} member{c.member_count === 1 ? "" : "s"}{c.status === "archived" ? " · archived" : ""}</p>
            {c.description && <p className="mt-1 line-clamp-2 text-sm">{c.description}</p>}</li>))}
      </ul>
      <div className="flex justify-between"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn" disabled={(list.data?.length ?? 0) < 20} onClick={() => setPage(page + 1)}>Next</button></div>
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={(slug) => nav(`/app/c/${slug}`)} />}
    </div>
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
        <h2 className="font-semibold">Create a community</h2>
        <div><label className="label" htmlFor="cn">Name</label><input id="cn" className="input" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} /></div>
        <div><label className="label" htmlFor="cs">Web address (letters, numbers, dashes)</label><input id="cs" className="input" maxLength={40} value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value.toLowerCase() }); }} /></div>
        <div><label className="label" htmlFor="cc">Category</label><select id="cc" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{COMMUNITY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="cd">Description (optional)</label><textarea id="cd" className="input" rows={3} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <p className="text-xs text-muted">Communities must follow the community guidelines and can be disabled by platform moderators.</p>
        {m.isError && <p role="alert" className="err">{socialErrorMessage(String((m.error as Error).message))}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!valid || m.isPending}>{m.isPending ? "Creating…" : "Create"}</button></div>
      </form>
    </div>,
    document.body,
    )
  );
}
