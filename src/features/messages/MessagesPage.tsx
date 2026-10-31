import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { Avatar } from "@/features/social/components/Avatar";
import { ReportDialog } from "@/features/social/components/ReportDialog";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import { blockUser } from "@/features/social/api";
import { socialErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { LoadingState } from "@/app/LoadingState";

interface Conv { conversation_id: string; other_user_id: string; username: string | null; display_name: string | null; avatar_path: string | null; last_message_at: string; preview: string | null; unread_count: number }
interface Msg { id: string; sender_id: string; body: string; status: string; created_at: string }

export function MessagesPage() {
  const { id } = useParams();
  const convs = useQuery({ queryKey: ["conversations"], queryFn: async () => { const { data, error } = await supabase.rpc("my_conversations"); if (error) throw error; return (data ?? []) as Conv[]; } });
  const active = convs.data?.find((c) => c.conversation_id === id) ?? null;
  // Mobile: either the list OR the chat (never squeezed side by side). Desktop: two columns.
  return (
    <div className="md:grid md:grid-cols-[18rem,1fr] md:gap-4">
      <aside className={`${id ? "hidden md:block" : "block"}`} aria-label="Conversations">
        <h1 className="mb-3 text-2xl font-semibold">Messages</h1>
        {convs.isLoading && <LoadingState label="Finding your conversations" variant="panel" />}
        {convs.isError && <p role="alert" className="err">Could not load conversations.</p>}
        {convs.data?.length === 0 && <p className="card text-sm text-muted">No conversations yet. Open a student's profile and choose Message.</p>}
        <ul className="space-y-2">{convs.data?.map((c) => (
          <li key={c.conversation_id}><Link to={`/app/messages/${c.conversation_id}`} className={`card flex items-center gap-3 ${c.conversation_id === id ? "ring-2 ring-primary" : ""}`}>
            <Avatar name={c.display_name ?? "?"} path={c.avatar_path} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{c.display_name ?? "Student"}</p><p className="truncate text-xs text-muted">{c.preview ?? "No messages yet"}</p></div>
            {c.unread_count > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-fg" aria-label={`${c.unread_count} unread`}>{c.unread_count}</span>}</Link></li>))}</ul>
      </aside>
      {id ? <Thread key={id} convId={id} other={active} /> : <div className="hidden md:flex md:items-center md:justify-center md:text-muted">Select a conversation</div>}
    </div>
  );
}

function Thread({ convId, other }: { convId: string; other: Conv | null }) {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const qc = useQueryClient();
  const nav = useNavigate();
  const [text, setText] = useState(""); const [live, setLive] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null); const [blocking, setBlocking] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const msgs = useQuery({ queryKey: ["messages", convId], queryFn: async () => {
    const { data, error } = await supabase.from("messages").select("id,sender_id,body,status,created_at").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(60);
    if (error) throw error; return ((data ?? []) as Msg[]).reverse(); } });
  const markRead = () => { void supabase.rpc("mark_conversation_read", { p_conv: convId }).then(() => { void qc.invalidateQueries({ queryKey: ["conversations"] }); void qc.invalidateQueries({ queryKey: ["unread"] }); }); };

  useEffect(() => {
    markRead();
    const channel = supabase.channel(`thread-${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, () => { void qc.invalidateQueries({ queryKey: ["messages", convId] }); markRead(); })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs.data?.length]);

  const send = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("send_message", { p_conv: convId, p_body: text }); if (error) throw error; },
    onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["messages", convId] }); void qc.invalidateQueries({ queryKey: ["conversations"] }); } });
  const del = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.rpc("delete_own_message", { p_msg: id }); if (error) throw error; }, onSuccess: () => void qc.invalidateQueries({ queryKey: ["messages", convId] }) });
  const block = useMutation({ mutationFn: () => blockUser(other!.other_user_id), onSuccess: () => { void qc.invalidateQueries(); nav("/app/messages"); } });

  return (
    // Mobile: full-screen chat (inset-0) using dynamic viewport so the composer stays above the keyboard. Desktop: a column.
    <section aria-label="Conversation" className="fixed inset-0 z-30 flex flex-col bg-bg md:static md:z-auto md:h-[calc(100dvh-8rem)] md:rounded-xl md:border md:border-line">
      <header className="flex items-center gap-3 border-b border-line bg-surface p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
        <Link to="/app/messages" aria-label="Back to conversations" className="md:hidden"><ArrowLeft size={20} /></Link>
        <Avatar name={other?.display_name ?? "?"} path={other?.avatar_path ?? null} size={32} />
        <div className="min-w-0 flex-1"><p className="truncate font-medium">{other?.display_name ?? "Conversation"}</p><p className="text-xs text-muted">{live ? "Connected" : "Connecting…"}</p></div>
        {other && <button className="text-xs underline text-muted" onClick={() => setBlocking(true)}>Block</button>}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite">
        {msgs.isLoading && <LoadingState label="Gathering messages" />}
        {msgs.isError && <p role="alert" className="err">Could not load messages.</p>}
        {msgs.data?.length === 0 && <p className="text-center text-sm text-muted">Say hello 👋</p>}
        {msgs.data?.map((m) => { const mine = m.sender_id === me; return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-fg" : "border border-line bg-surface"}`}>
              {m.status === "deleted" ? <em className="opacity-70">Message deleted</em> : <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              <p className="mt-1 text-[10px] opacity-70">{timeAgo(m.created_at)}{m.status === "visible" && (mine ? <button className="ml-2 underline" onClick={() => del.mutate(m.id)}>Delete</button> : <button className="ml-2 underline" onClick={() => setReporting(m.id)}>Report</button>)}</p>
            </div></div>); })}
        <div ref={bottom} />
      </div>
      {send.isError && <p role="alert" className="err px-3">{socialErrorMessage(String((send.error as Error).message))}</p>}
      <form className="flex gap-2 border-t border-line bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
        <input className="input" aria-label="Message" maxLength={2000} placeholder="Write a message…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary" disabled={send.isPending || !text.trim()}>Send</button>
      </form>
      {reporting && <ReportDialog type="message" targetId={reporting} onClose={() => setReporting(null)} />}
      {blocking && <ConfirmDialog title="Block this person?" confirmLabel="Block" busy={block.isPending} onConfirm={() => block.mutate()} onCancel={() => setBlocking(false)}>You will not be able to message each other.</ConfirmDialog>}
    </section>
  );
}
