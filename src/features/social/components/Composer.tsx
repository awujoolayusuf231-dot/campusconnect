import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Send, SquarePen, UsersRound, X } from "lucide-react";
import { createPost, validateImages } from "../api";
import { socialErrorMessage } from "@/lib/errors";

export function Composer({ communityId }: { communityId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [fileError, setFileError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const posting = useRef(false);
  const openComposer = () => { setNotice(""); setOpen(true); };

  const m = useMutation({
    mutationFn: () => createPost(body, files, communityId),
    onSuccess: ({ failedImages }) => {
      setBody(""); setFiles([]); if (input.current) input.current.value = "";
      setNotice(failedImages ? `Posted, but ${failedImages} image(s) could not be uploaded.` : "Posted!");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["feed"] }); void qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
  posting.current = m.isPending;

  useEffect(() => {
    if (!open) return;
    textarea.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !posting.current) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      trigger.current?.focus();
    };
  }, [open]);

  function pick(list: FileList | null) {
    const next = Array.from(list ?? []);
    const problem = validateImages(next);
    setFileError(problem ?? ""); setNotice("");
    setFiles(problem ? [] : next);
    if (problem && input.current) input.current.value = "";
  }

  return createPortal(
    <>
      <section className="rounded-2xl border border-line bg-white p-3 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-4" aria-label="Create a post">
        <button
          type="button"
          onClick={openComposer}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-transparent bg-bg px-3 text-left text-sm text-muted transition hover:border-[#f0d7da] hover:bg-[#fffafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:px-4"
          aria-haspopup="dialog"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7e7e9] text-primary"><UsersRound size={17} aria-hidden="true" /></span>
          <span className="flex-1">What’s happening on campus?</span>
          <span className="hidden rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-primary shadow-sm sm:inline">Write a post</span>
        </button>
        <div className="mt-3 flex items-center justify-between border-t border-line/80 pt-3">
          <span className="hidden text-xs font-medium text-muted sm:inline">Share a moment with your community</span>
          <button type="button" onClick={openComposer} className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted transition hover:bg-[#fff1f2] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-haspopup="dialog">
            <ImagePlus size={16} aria-hidden="true" /> Photo or video
          </button>
        </div>
      </section>
      <button
        ref={trigger}
        type="button"
        onClick={openComposer}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_10px_28px_rgba(100,20,30,0.3)] transition duration-200 hover:scale-105 hover:bg-[#a92230] hover:shadow-[0_14px_34px_rgba(100,20,30,0.36)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary active:scale-95 lg:bottom-8 lg:right-8"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Create a post"
        title="Create a post"
      >
        <SquarePen size={23} strokeWidth={2.2} aria-hidden="true" />
        <span className="sr-only">Share something with your campus</span>
      </button>
      {notice && <p role="status" className="px-1 text-sm text-muted">{notice}</p>}

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !m.isPending) setOpen(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="composer-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] border border-line/70 bg-[#fbfaf9] shadow-2xl sm:max-w-xl sm:rounded-[24px]">
            <div className="flex items-start justify-between gap-4 rounded-t-[24px] border-b border-line bg-white px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Your campus community</p>
                <h2 id="composer-title" className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">Create a post</h2>
                <p className="mt-1 text-sm leading-5 text-muted">Share an update, ask a question, or start a conversation.</p>
              </div>
              <button type="button" aria-label="Close post composer" className="rounded-lg p-2 text-muted hover:bg-[#f4e3e4] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" onClick={() => setOpen(false)} disabled={m.isPending}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form className="space-y-4 p-4 sm:p-6" onSubmit={(event) => { event.preventDefault(); if (body.trim() && !m.isPending) m.mutate(); }}>
              <label className="sr-only" htmlFor="post-body">What's happening?</label>
              <textarea
                ref={textarea}
                id="post-body"
                className="input min-h-44 resize-y rounded-2xl border-[#e7dedb] bg-white p-4 leading-7 shadow-inner focus-visible:border-primary"
                rows={5}
                maxLength={2000}
                placeholder="What's happening?"
                value={body}
                onChange={(event) => { setBody(event.target.value); setNotice(""); }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="btn min-h-10 cursor-pointer gap-2 rounded-xl bg-white font-semibold hover:border-primary/30 hover:text-primary">
                  <ImagePlus size={16} aria-hidden="true" /> Add photos
                  <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => pick(event.target.files)} />
                </label>
                {files.length > 0 && <span className="rounded-full bg-[#f8e9ea] px-3 py-1.5 text-xs font-semibold text-primary">{files.length} image(s) selected</span>}
                <span className="ml-auto text-xs tabular-nums text-muted">{body.length}/2000</span>
              </div>
              {fileError && <p role="alert" className="err">{fileError}</p>}
              {m.isError && <p role="alert" className="err">{socialErrorMessage((m.error as Error).message)}</p>}
              <div className="flex justify-end border-t border-line pt-4">
                <button className="btn-primary min-h-11 gap-2 rounded-xl px-5 shadow-sm" disabled={m.isPending || !body.trim()}>
                  <Send size={15} aria-hidden="true" />{m.isPending ? "Posting…" : "Post"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}
