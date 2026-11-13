import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, CalendarDays, ChevronRight, CircleAlert, ImagePlus, LoaderCircle, LockKeyhole, Pencil, ShieldCheck, Trash2, Upload, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { archiveCommunity, COMMUNITY_CATEGORIES, getCommunityBySlug, joinCommunity, leaveCommunity, listMembers, myCommunityRole, setMember, setPostState, updateCommunity, type Community } from "./api";
import { communityCoverUrl, removeCommunityCover, uploadCommunityCover } from "./communityCover";
import { listActiveInstitutions, type InstitutionOption } from "@/features/institutions/api";
import { InstitutionPicker } from "@/features/institutions/InstitutionPicker";
import { useMyPermissions } from "@/features/admin/useMyPermissions";
import { fetchMediaPaths, FEED_PAGE, type Cursor, type FeedPost } from "@/features/social/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Composer } from "@/features/social/components/Composer";
import { PostCard } from "@/features/social/components/PostCard";
import { Avatar } from "@/features/social/components/Avatar";
import { ReportDialog } from "@/features/social/components/ReportDialog";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import { socialErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { LoadingState } from "@/app/LoadingState";

type Tab = "posts" | "about" | "members" | "moderation";

export function CommunityPage() {
  const { slug = "" } = useParams();
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("posts");
  const [reporting, setReporting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const community = useQuery({ queryKey: ["community", slug], queryFn: () => getCommunityBySlug(slug) });
  const c = community.data;
  const role = useQuery({
    queryKey: ["community-role", c?.id, me],
    enabled: !!c,
    queryFn: () => myCommunityRole(c!.id),
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const permissions = useMyPermissions();
  const membershipKnown = role.isFetched && !role.isError;
  const isMod = role.data === "owner" || role.data === "moderator";
  const isOwner = role.data === "owner";
  const canEditSettings = membershipKnown && isOwner;
  const canViewMembers = (membershipKnown && isMemberRole(role.data)) || permissions.data?.includes("communities.manage") === true;
  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions, enabled: canEditSettings });
  const cover = useQuery({
    queryKey: ["community-cover", c?.id, c?.cover_path],
    enabled: !!c?.cover_path,
    queryFn: () => communityCoverUrl(c!.id, c!.cover_path),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["community", slug] });
    void qc.invalidateQueries({ queryKey: ["community-role", c?.id] });
    void qc.invalidateQueries({ queryKey: ["community-members", c?.id] });
    void qc.invalidateQueries({ queryKey: ["communities"] });
    void qc.invalidateQueries({ queryKey: ["my-communities"] });
  };
  const join = useMutation({ mutationFn: () => joinCommunity(c!.id), onSuccess: refresh });
  const leave = useMutation({ mutationFn: () => leaveCommunity(c!.id), onSuccess: () => {
    setLeaving(false);
    if (c) {
      qc.setQueryData(["community-role", c.id, me], null);
      clearCommunityPostCache(qc, c.id, me);
    }
    refresh();
  } });
  const archive = useMutation({ mutationFn: () => archiveCommunity(c!.id, c!.status === "active"), onSuccess: refresh });

  if (community.isLoading) return <LoadingState label="Finding this community" variant="page" />;
  if (community.isError) return <div role="alert" className="card"><p className="font-bold">Could not load this community.</p><button className="btn mt-3" onClick={() => void community.refetch()}>Try again</button></div>;
  if (!c) return <div className="card"><p className="font-bold">This community does not exist or is not available.</p><Link className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline" to="/app/communities"><ArrowLeft size={15} />Back to communities</Link></div>;
  const isMember = isMemberRole(role.data);
  const err = (join.error ?? leave.error ?? archive.error) as Error | null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/app/communities" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted transition hover:bg-white hover:text-primary"><ArrowLeft size={16} aria-hidden="true" />All communities</Link>
      <section className="overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_12px_36px_rgba(35,24,20,0.055)]">
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#741923] via-[#a52432] to-[#df7a80] bg-cover bg-center sm:h-64"
          style={cover.data ? { backgroundImage: `linear-gradient(to top, rgba(49,16,20,0.2), rgba(49,16,20,0.02)), url("${cover.data}")` } : undefined}>
          <div aria-hidden="true" className="absolute -right-10 -top-20 h-56 w-56 rounded-full border border-white/15" />
          <div aria-hidden="true" className="absolute right-8 -top-14 h-44 w-44 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -bottom-28 left-[28%] h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/95 backdrop-blur sm:bottom-5 sm:right-6">
            <Users size={13} aria-hidden="true" />{COMMUNITY_CATEGORIES.find(([v]) => v === c.category)?.[1] ?? "Community"}
          </span>
        </div>
        <div className="p-4 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-black tracking-[-0.035em] text-fg sm:text-3xl">{c.name}</h1>
                {isOwner && <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1ef] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary"><ShieldCheck size={12} />Owner</span>}
                {role.data === "moderator" && <span className="inline-flex items-center gap-1 rounded-full bg-[#f7f1ee] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#72514c]"><ShieldCheck size={12} />Moderator</span>}
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff4f2] px-3 py-1.5 text-[#8b3c43]"><Users size={14} aria-hidden="true" />{c.member_count} member{c.member_count === 1 ? "" : "s"}</span>
                <span className="rounded-full bg-bg px-3 py-1.5">{COMMUNITY_CATEGORIES.find(([v]) => v === c.category)?.[1] ?? "Community"}</span>
                {c.status !== "active" && <><span aria-hidden="true">·</span><span className="font-semibold capitalize">{c.status}</span></>}
              </p>
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#514a48]">{c.description || "This community hasn’t added a description yet."}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:max-w-[19rem] lg:justify-end">
              {role.isLoading ? <span role="status" className="col-span-2 inline-flex min-h-11 items-center gap-2 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" />Checking membership…</span> : !role.isError ? <>
                {!isMember && c.status === "active" && <button className="btn-primary min-h-11 rounded-xl px-5 font-bold" disabled={join.isPending} onClick={() => join.mutate()}>{join.isPending ? "Joining…" : "Join community"}</button>}
                {isMember && !isOwner && <button className="btn min-h-11 rounded-xl px-5 font-bold" onClick={() => setLeaving(true)}>Leave community</button>}
                {isOwner && c.status !== "disabled" && <button className="btn min-h-11 rounded-xl px-4 font-bold" disabled={archive.isPending} onClick={() => archive.mutate()}><Archive size={16} className="mr-1.5 inline" />{archive.isPending ? "Updating…" : c.status === "active" ? "Archive" : "Unarchive"}</button>}
                {!isOwner && <button className="btn min-h-11 rounded-xl px-4 font-bold" onClick={() => setReporting(true)}>Report</button>}
              </> : null}
            </div>
          </div>
          {role.isError && <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-danger"><CircleAlert size={16} />Could not check your community access. Refresh before taking an action.</p>}
          {c.status === "archived" && <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#fbf7f4] p-3 text-sm text-muted"><LockKeyhole size={16} />This community is archived and read-only.</p>}
          {c.status === "disabled" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-danger">This community has been disabled by platform moderators.</p>}
          {err && <p role="alert" className="err mt-3">{socialErrorMessage(err.message)}</p>}
          {cover.isError && <p role="alert" className="mt-3 text-sm text-danger">Could not load the community cover image.</p>}
          {canEditSettings && c.status !== "disabled" && <ManageCommunity
            community={c}
            institutions={institutions.data ?? []}
            institutionsLoading={institutions.isLoading}
            institutionsError={institutions.isError}
            onSaved={refresh}
          />}
        </div>
      </section>
      <div role="tablist" aria-label="Community" className="flex gap-2 overflow-x-auto rounded-2xl border border-line bg-white p-2">
        {(["posts", "about", "members", ...(isMod ? ["moderation"] : [])] as Tab[]).map((t) => <button key={t} id={`community-tab-${t}`} role="tab" aria-controls={`community-panel-${t}`} aria-selected={tab === t} tabIndex={tab === t ? 0 : -1} className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-bold transition ${tab === t ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:bg-[#fff4f2] hover:text-primary"}`} onClick={() => setTab(t)}>{t === "moderation" ? "Moderation" : t[0]!.toUpperCase() + t.slice(1)}</button>)}
      </div>
      {tab === "posts" && <div id="community-panel-posts" role="tabpanel" aria-labelledby="community-tab-posts" tabIndex={0}><CommunityPosts community={c} isMember={isMember} membershipKnown={membershipKnown} isMod={isMod} me={me} /></div>}
      {tab === "about" && <div id="community-panel-about" role="tabpanel" aria-labelledby="community-tab-about" tabIndex={0}><CommunityAbout community={c} /></div>}
      {tab === "members" && <div id="community-panel-members" role="tabpanel" aria-labelledby="community-tab-members" tabIndex={0}><Members id={c.id} me={me} role={role.data ?? null} canView={canViewMembers} /></div>}
      {tab === "moderation" && isMod && <div id="community-panel-moderation" role="tabpanel" aria-labelledby="community-tab-moderation" tabIndex={0}><ModerationTab id={c.id} /></div>}
      {reporting && <ReportDialog type="community" targetId={c.id} onClose={() => setReporting(false)} />}
      {leaving && <ConfirmDialog title="Leave this community?" confirmLabel="Leave" busy={leave.isPending} onConfirm={() => leave.mutate()} onCancel={() => setLeaving(false)} />}
    </div>
  );
}

function CommunityAbout({ community }: { community: Pick<Community, "description" | "category" | "member_count" | "status" | "created_at"> }) {
  const category = COMMUNITY_CATEGORIES.find(([value]) => value === community.category)?.[1] ?? "Community";
  const created = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(community.created_at));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,0.8fr)]">
      <section aria-labelledby="community-about-heading" className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">About this community</p>
        <h2 id="community-about-heading" className="mt-2 text-xl font-black tracking-tight text-fg">A place to connect and take part</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted">{community.description || "This community hasn’t added a description yet."}</p>
      </section>
      <section aria-labelledby="community-details-heading" className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
        <h2 id="community-details-heading" className="text-sm font-extrabold text-fg">Community details</h2>
        <dl className="mt-4 divide-y divide-line">
          <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <dt className="text-sm text-muted">Category</dt><dd className="text-sm font-bold text-fg">{category}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="inline-flex items-center gap-2 text-sm text-muted"><Users size={15} aria-hidden="true" />Members</dt>
            <dd className="text-sm font-bold text-fg">{community.member_count.toLocaleString()}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="inline-flex items-center gap-2 text-sm text-muted"><CalendarDays size={15} aria-hidden="true" />Created</dt>
            <dd className="text-sm font-bold text-fg">{created}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
            <dt className="text-sm text-muted">Status</dt><dd className="text-sm font-bold capitalize text-fg">{community.status}</dd>
          </div>
        </dl>
        {community.status === "archived" && <p className="mt-4 rounded-xl bg-[#fbf7f4] p-3 text-xs leading-5 text-muted">This community is archived and its posts are unavailable.</p>}
      </section>
    </div>
  );
}

function isMemberRole(role: string | null | undefined): boolean {
  return role === "member" || role === "owner" || role === "moderator";
}

function ManageCommunity({
  community,
  institutions,
  institutionsLoading,
  institutionsError,
  onSaved,
}: {
  community: { id: string; name: string; description: string | null; category: string; institution_id: string | null; cover_path: string | null };
  institutions: readonly InstitutionOption[];
  institutionsLoading: boolean;
  institutionsError: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [category, setCategory] = useState(community.category);
  const [institutionId, setInstitutionId] = useState(community.institution_id ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [removeCover, setRemoveCover] = useState(false);
  const [confirmRemoveCover, setConfirmRemoveCover] = useState(false);
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState("");
  const savedCover = useQuery({
    queryKey: ["community-cover-edit", community.id, community.cover_path],
    enabled: !!community.cover_path,
    queryFn: () => communityCoverUrl(community.id, community.cover_path),
  });
  useEffect(() => {
    if (!coverFile) {
      setCoverPreview("");
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);
  useEffect(() => {
    if (open) return;
    setName(community.name);
    setDescription(community.description ?? "");
    setCategory(community.category);
    setInstitutionId(community.institution_id ?? "");
    setCoverFile(null);
    setRemoveCover(false);
  }, [community, open]);
  const m = useMutation({
    mutationFn: async () => {
      let nextCoverPath = community.cover_path;
      let uploadedPath: string | null = null;
      if (coverFile) {
        uploadedPath = await uploadCommunityCover(community.id, coverFile);
        nextCoverPath = uploadedPath;
      } else if (removeCover) {
        nextCoverPath = null;
      }
      try {
        await updateCommunity(community.id, {
          name,
          description,
          category,
          institutionId: institutionId || null,
          coverPath: nextCoverPath,
        });
      } catch (error) {
        if (uploadedPath) {
          const cleaned = await removeCommunityCover(community.id, uploadedPath);
          if (!cleaned) throw new Error("Community details were not saved, and the uploaded cover could not be cleaned up.");
        }
        throw error;
      }
      const oldCoverRemoved = !community.cover_path || community.cover_path === nextCoverPath
        ? true
        : await removeCommunityCover(community.id, community.cover_path);
      return oldCoverRemoved;
    },
    onSuccess: (oldCoverRemoved) => {
      setSuccess(oldCoverRemoved ? "Community changes saved." : "Changes saved, but the previous cover file could not be deleted.");
      setOpen(false);
      onSaved();
    },
  });
  const valid = name.trim().length >= 3 && name.trim().length <= 60 && description.length <= 500;
  if (!open) return <div className="mt-5">
    <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#f0dadd] px-3 text-sm font-bold text-primary transition hover:bg-[#fff7f6]" onClick={() => { setSuccess(""); setOpen(true); }}><Pencil size={15} />Manage Community<ChevronRight size={15} /></button>
    {success && <p role="status" className="mt-2 text-sm text-muted">{success}</p>}
  </div>;
  return (
    <section aria-label="Manage community" className="mt-5 rounded-2xl border border-[#f0dadd] bg-[#fff9f8] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-extrabold text-fg">Manage community</h2><p className="mt-1 text-xs leading-5 text-muted">Update your community details. Only the active community owner can make these changes.</p></div>
        <button type="button" className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-white" onClick={() => setOpen(false)}>Close</button>
      </div>
      <label className="label mt-4" htmlFor="community-name">Community name</label>
      <input id="community-name" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <p className="mt-1 text-xs text-muted">The community URL will remain unchanged.</p>
      <label className="label mt-4" htmlFor="community-description">Description</label>
      <textarea id="community-description" aria-label="Community description" className="input" rows={4} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="label mt-4" htmlFor="community-category">Category</label>
      <select id="community-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{COMMUNITY_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label className="label mt-4" htmlFor="community-institution">Institution</label>
      <InstitutionPicker id="community-institution" selectedId={institutionId} institutions={institutions} onChange={setInstitutionId} isLoading={institutionsLoading} isError={institutionsError} />
      <div className="mt-4">
        <p className="label">Community cover image</p>
        <div role="img" aria-label={coverPreview ? "Selected community cover preview" : "Current community cover"} className="h-32 rounded-xl bg-gradient-to-br from-[#741923] via-[#a52432] to-[#df7a80] bg-cover bg-center"
          style={coverPreview ? { backgroundImage: `url("${coverPreview}")` } : !removeCover && savedCover.data ? { backgroundImage: `url("${savedCover.data}")` } : undefined} />
        {!coverPreview && !savedCover.data && !removeCover && !community.cover_path && <p className="mt-2 text-xs text-muted">No cover image has been added.</p>}
        {savedCover.isError && <p role="alert" className="mt-2 text-sm text-danger">Could not load the current cover preview.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="btn inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 font-semibold"><ImagePlus size={16} />{community.cover_path ? "Change cover image" : "Upload cover image"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose community cover image" onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              if (file) { setCoverFile(file); setRemoveCover(false); setSuccess(""); }
              event.currentTarget.value = "";
            }} />
          </label>
          {community.cover_path && !removeCover && <button type="button" className="btn inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-semibold text-danger" onClick={() => setConfirmRemoveCover(true)}><Trash2 size={15} />Remove cover</button>}
          {removeCover && <button type="button" className="btn min-h-10 rounded-xl px-3" onClick={() => setRemoveCover(false)}>Keep current cover</button>}
          {coverFile && <button type="button" className="btn min-h-10 rounded-xl px-3" onClick={() => setCoverFile(null)}>Clear selection</button>}
        </div>
        <p className="mt-2 text-xs text-muted">{coverFile ? `Selected: ${coverFile.name}. The cover is saved with the community changes.` : "JPEG, PNG, or WebP. Maximum 2 MB after automatic resizing."}</p>
      </div>
      {m.isError && <p role="alert" className="err mt-2">{socialErrorMessage(String((m.error as Error).message))}</p>}
      {success && <p role="status" className="mt-2 text-sm text-muted">{success}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" disabled={m.isPending} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="btn-primary min-h-10 rounded-xl px-4 font-bold" disabled={m.isPending || !valid} onClick={() => m.mutate()}>{m.isPending ? <><LoaderCircle size={15} className="mr-1 inline animate-spin" />Saving…</> : <><Upload size={15} className="mr-1 inline" />Save community</>}</button>
      </div>
      {confirmRemoveCover && <ConfirmDialog
        title="Remove community cover?"
        confirmLabel="Remove cover"
        onCancel={() => setConfirmRemoveCover(false)}
        onConfirm={() => {
          setRemoveCover(true);
          setCoverFile(null);
          setSuccess("");
          setConfirmRemoveCover(false);
        }}
      >
        The current cover image will be removed when you save these community changes.
      </ConfirmDialog>}
    </section>
  );
}

function CommunityPosts({ community, isMember, membershipKnown, isMod, me }: { community: { id: string; status: string }; isMember: boolean; membershipKnown: boolean; isMod: boolean; me: string }) {
  const qc = useQueryClient();
  const [hiding, setHiding] = useState<string | null>(null); const [reason, setReason] = useState("");
  const canAccessPosts = membershipKnown && community.status === "active" && isMember;
  const feed = useInfiniteQuery({
    queryKey: ["community-posts", community.id, me], initialPageParam: null as Cursor | null,
    enabled: canAccessPosts,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("community_posts", { p_comm: community.id, p_before: pageParam?.created_at ?? null, p_before_id: pageParam?.id ?? null, p_limit: FEED_PAGE });
      if (error) throw error; return (data ?? []) as FeedPost[]; },
    getNextPageParam: (last): Cursor | undefined => { const t = last[last.length - 1]; return last.length === FEED_PAGE && t ? { created_at: t.activity_at, id: t.id } : undefined; },
  });
  useEffect(() => {
    if (membershipKnown && !isMember) clearCommunityPostCache(qc, community.id, me);
  }, [community.id, isMember, me, membershipKnown, qc]);
  const posts = canAccessPosts ? feed.data?.pages.flat() ?? [] : []; const ids = posts.map((p) => p.id);
  const media = useQuery({ queryKey: ["media", ids.join(",")], enabled: canAccessPosts && ids.length > 0, queryFn: () => fetchMediaPaths(ids) });
  const hide = useMutation({ mutationFn: () => setPostState(hiding!, true, reason), onSuccess: () => { setHiding(null); setReason(""); void qc.invalidateQueries({ queryKey: ["community-posts"] }); void qc.invalidateQueries({ queryKey: ["community-hidden"] }); } });
  return (
    <div className="space-y-3">
      {membershipKnown && isMember && community.status === "active" && <Composer communityId={community.id} />}
      {membershipKnown && !isMember && community.status === "active" && <p className="rounded-2xl border border-[#f0dadd] bg-white p-5 text-sm leading-6 text-muted">Join this community to see its posts and take part in the conversation.</p>}
      {community.status !== "active" && <p className="rounded-2xl border border-line bg-white p-5 text-sm leading-6 text-muted">Community posts are unavailable while this community is {community.status}.</p>}
      {canAccessPosts && feed.isLoading && <LoadingState label="Gathering community posts" variant="panel" />}
      {canAccessPosts && feed.isError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger"><p>Could not load community posts.</p><button className="btn mt-3" onClick={() => void feed.refetch()}>Try again</button></div>}
      {canAccessPosts && feed.isSuccess && posts.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">No posts yet. Start the conversation with your community.</p>}
      {canAccessPosts && ids.length > 0 && media.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-danger">Some post media could not be loaded.</p>}
      {posts.map((p) => (
        <div key={p.id} className="space-y-1">
          <PostCard post={p} images={media.data?.[p.id]} me={me} inCommunity />
          {isMod && p.author_id !== me && <button className="text-xs underline text-muted" onClick={() => setHiding(p.id)}>Hide as community moderator</button>}
        </div>))}
      {canAccessPosts && feed.hasNextPage && <button className="btn min-h-11 w-full" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? "Loading more posts…" : "Load more posts"}</button>}
      {hiding && (
        <div role="dialog" aria-modal="true" aria-label="Hide post" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="card w-full max-w-sm space-y-3"><h2 className="font-semibold">Hide this post</h2>
            <label className="label" htmlFor="hr">Reason (min 5 characters, recorded in the community log)</label><textarea id="hr" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {hide.isError && <p role="alert" className="err">{socialErrorMessage(String((hide.error as Error).message))}</p>}
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setHiding(null)}>Cancel</button><button className="btn-danger" disabled={reason.trim().length < 5 || hide.isPending} onClick={() => hide.mutate()}>Hide</button></div></div></div>)}
    </div>
  );
}

function clearCommunityPostCache(queryClient: QueryClient, communityId: string, userId: string) {
  const queryKey = ["community-posts", communityId, userId] as const;
  const cached = queryClient.getQueryData<{ pages: FeedPost[][] }>(queryKey);
  const postIds = cached?.pages.flatMap((page) => page.map((post) => post.id)) ?? [];

  queryClient.removeQueries({ queryKey, exact: true });
  if (postIds.length === 0) return;

  queryClient.removeQueries({ queryKey: ["media", postIds.join(",")], exact: true });
  for (const postId of postIds) {
    queryClient.removeQueries({ queryKey: ["post", postId], exact: true });
    queryClient.removeQueries({ queryKey: ["comments", postId] });
  }
}

function Members({ id, me, role, canView }: { id: string; me: string; role: string | null; canView: boolean }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ user: string; action: string } | null>(null); const [reason, setReason] = useState("");
  const members = useQuery({ queryKey: ["community-members", id, me], enabled: canView, queryFn: () => listMembers(id) });
  const act = useMutation({ mutationFn: () => setMember(id, pending!.user, pending!.action, reason), onSuccess: () => { setPending(null); setReason(""); void qc.invalidateQueries({ queryKey: ["community-members"] }); void qc.invalidateQueries({ queryKey: ["community-banned"] }); void qc.invalidateQueries({ queryKey: ["community"] }); } });
  const needsReason = pending && ["ban", "unban", "remove"].includes(pending.action);
  const isMod = role === "owner" || role === "moderator";
  const run = (user: string, action: string) => (action === "make_moderator" || action === "remove_moderator") ? setPending({ user, action }) : setPending({ user, action });
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <h2 className="text-base font-extrabold text-fg">Community members</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Active members and their current community roles.</p>
      </div>
      {members.isLoading && <LoadingState label="Finding community members" />}
      {members.isError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
        <p>Could not load community members.</p>
        <button type="button" className="mt-2 font-bold underline" onClick={() => void members.refetch()}>Try again</button>
      </div>}
      {!canView && <p className="rounded-2xl border border-line bg-white p-5 text-sm leading-6 text-muted">Join this community to view its member list.</p>}
      {canView && members.isSuccess && members.data.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">There are no active members to show yet.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">{(canView ? members.data : undefined)?.map((m) => (
        <li key={m.user_id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-[0_6px_18px_rgba(35,24,20,0.025)] sm:p-4">
          <Avatar name={m.profile?.display_name ?? "?"} path={m.profile?.avatar_path ?? null} />
          <div className="min-w-0 flex-1"><Link to={`/app/u/${m.profile?.username ?? ""}`} className="break-words text-sm font-bold text-fg hover:text-primary hover:underline">{m.profile?.display_name ?? "Student"}</Link><p className="mt-1 text-xs text-muted">@{m.profile?.username ?? "student"} · joined {timeAgo(m.joined_at)}</p></div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold capitalize ${m.role === "owner" ? "bg-[#fff1ef] text-primary" : m.role === "moderator" ? "bg-[#f7f1ee] text-[#72514c]" : "bg-bg text-muted"}`}>{m.role}</span>
          {isMod && m.user_id !== me && m.role !== "owner" && (
            <div className="flex flex-wrap justify-end gap-1 text-xs sm:col-span-2">
              {(role === "owner" || m.role === "member") && <button className="btn" onClick={() => run(m.user_id, "ban")}>Ban</button>}
              {(role === "owner" || m.role === "member") && <button className="btn" onClick={() => run(m.user_id, "remove")}>Remove</button>}
              {role === "owner" && <button className="btn" onClick={() => run(m.user_id, m.role === "moderator" ? "remove_moderator" : "make_moderator")}>{m.role === "moderator" ? "Remove mod" : "Make mod"}</button>}
            </div>)}
        </li>))}</ul>
      {isMod && <BannedList id={id} onUnban={(user) => setPending({ user, action: "unban" })} />}
      {pending && (
        <div role="dialog" aria-modal="true" aria-label="Confirm action" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="card w-full max-w-sm space-y-3"><h2 className="font-semibold">Confirm: {pending.action.replace("_", " ")}</h2>
            {needsReason && <><label className="label" htmlFor="mr">Reason (min 5 characters)</label><textarea id="mr" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></>}
            {act.isError && <p role="alert" className="err">{socialErrorMessage(String((act.error as Error).message))}</p>}
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setPending(null)}>Cancel</button><button className="btn-danger" disabled={act.isPending || (!!needsReason && reason.trim().length < 5)} onClick={() => act.mutate()}>Confirm</button></div></div></div>)}
    </div>
  );
}

function ModerationTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const hidden = useQuery({ queryKey: ["community-hidden", id], queryFn: async () => {
    const { data, error } = await supabase.from("posts").select("id,body,created_at,hidden_scope").eq("community_id", id).eq("status", "hidden").order("created_at", { ascending: false }).limit(50);
    if (error) throw error; return (data ?? []) as { id: string; body: string; created_at: string; hidden_scope: string | null }[]; } });
  const log = useQuery({ queryKey: ["community-log", id], queryFn: async () => {
    const { data, error } = await supabase.from("community_mod_actions").select("id,action,reason,created_at").eq("community_id", id).order("created_at", { ascending: false }).limit(50);
    if (error) throw error; return (data ?? []) as { id: number; action: string; reason: string | null; created_at: string }[]; } });
  const restore = useMutation({ mutationFn: (post: string) => setPostState(post, false, reason), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["community-hidden"] }); void qc.invalidateQueries({ queryKey: ["community-posts"] }); void qc.invalidateQueries({ queryKey: ["community-log"] }); } });
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5"><h2 className="font-extrabold text-fg">Hidden posts</h2>
        <label className="label" htmlFor="rr">Reason for restoring (min 5 characters)</label><input id="rr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        {hidden.isLoading && <p role="status" className="mt-3 text-sm text-muted">Loading hidden posts…</p>}
        {hidden.isError && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-danger">Could not load hidden posts. <button type="button" className="font-bold underline" onClick={() => void hidden.refetch()}>Try again</button></div>}
        {hidden.isSuccess && hidden.data.length === 0 && <p className="mt-3 text-sm text-muted">No hidden posts.</p>}
        <ul className="mt-3 space-y-2">{hidden.data?.map((p) => (<li key={p.id} className="rounded-xl border border-line bg-white p-3 text-sm"><p className="line-clamp-3 whitespace-pre-wrap">{p.body}</p>
          {p.hidden_scope === "platform" ? <p className="text-xs text-muted">Removed by platform moderators; cannot be restored here.</p> : <button className="btn mt-1" disabled={reason.trim().length < 5 || restore.isPending} onClick={() => restore.mutate(p.id)}>Restore</button>}</li>))}</ul>
        {restore.isError && <p role="alert" className="err">{socialErrorMessage(String((restore.error as Error).message))}</p>}</section>
      <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5"><h2 className="font-extrabold text-fg">Moderation log</h2>
        {log.isLoading && <p role="status" className="mt-3 text-sm text-muted">Loading moderation history…</p>}
        {log.isError && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-danger">Could not load moderation history. <button type="button" className="font-bold underline" onClick={() => void log.refetch()}>Try again</button></div>}
        {log.isSuccess && log.data.length === 0 && <p className="mt-3 text-sm text-muted">Nothing yet.</p>}
        <ul className="mt-3 divide-y divide-line text-sm">{log.data?.map((a) => <li key={a.id} className="py-2 first:pt-0"><span className="font-semibold capitalize">{a.action.replace("_", " ")}</span>{a.reason ? ` — ${a.reason}` : ""} <span className="text-xs text-muted">{timeAgo(a.created_at)}</span></li>)}</ul></section>
    </div>
  );
}

function BannedList({ id, onUnban }: { id: string; onUnban: (user: string) => void }) {
  const banned = useQuery({ queryKey: ["community-banned", id], queryFn: async () => {
    const { data, error } = await supabase.rpc("community_banned_list", { p_comm: id }); if (error) throw error;
    return (data ?? []) as { user_id: string; username: string; display_name: string; joined_at: string }[]; } });
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5"><h2 className="font-extrabold text-fg">Banned members</h2>
      {banned.isLoading && <p role="status" className="mt-3 text-sm text-muted">Loading banned members…</p>}
      {banned.isError && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-danger">Could not load banned members. <button type="button" className="font-bold underline" onClick={() => void banned.refetch()}>Try again</button></div>}
      {banned.isSuccess && banned.data.length === 0 && <p className="mt-3 text-sm text-muted">There are no banned members.</p>}
      <ul className="mt-3 space-y-2 text-sm">{banned.data?.map((b) => <li key={b.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"><span className="min-w-0 break-words font-semibold">{b.display_name} <span className="font-normal text-muted">@{b.username}</span></span><button className="btn min-h-9" onClick={() => onUnban(b.user_id)}>Unban</button></li>)}</ul></section>
  );
}
