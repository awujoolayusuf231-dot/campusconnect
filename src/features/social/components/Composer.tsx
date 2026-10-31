import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Send, SquarePen, X } from "lucide-react";
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

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => { setNotice(""); setOpen(true); }}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_28px_rgba(100,20,30,0.3)] transition duration-200 hover:scale-105 hover:bg-[#a92230] hover:shadow-[0_14px_34px_rgba(100,20,30,0.36)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary active:scale-95 lg:bottom-8 lg:right-8"
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
          <section role="dialog" aria-modal="true" aria-labelledby="composer-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-bg p-4 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-primary">Your campus community</p>
                <h2 id="composer-title" className="mt-1 text-xl font-black tracking-tight text-fg">Create a post</h2>
                <p className="mt-1 text-sm text-muted">Share an update, ask a question, or start a conversation.</p>
              </div>
              <button type="button" aria-label="Close post composer" className="rounded-lg p-2 text-muted hover:bg-[#f4e3e4] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" onClick={() => setOpen(false)} disabled={m.isPending}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (body.trim() && !m.isPending) m.mutate(); }}>
              <label className="sr-only" htmlFor="post-body">What's happening?</label>
              <textarea
                ref={textarea}
                id="post-body"
                className="input min-h-40 resize-y bg-white p-4 leading-6"
                rows={6}
                maxLength={2000}
                placeholder="What's happening?"
                value={body}
                onChange={(event) => { setBody(event.target.value); setNotice(""); }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="btn cursor-pointer">
                  <ImagePlus size={16} className="mr-1" aria-hidden="true" /> Add images
                  <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => pick(event.target.files)} />
                </label>
                {files.length > 0 && <span className="text-sm text-muted">{files.length} image(s) selected</span>}
                <span className="ml-auto text-xs text-muted">{body.length}/2000</span>
              </div>
              {fileError && <p role="alert" className="err">{fileError}</p>}
              {m.isError && <p role="alert" className="err">{socialErrorMessage((m.error as Error).message)}</p>}
              <div className="flex justify-end border-t border-line pt-3">
                <button className="btn-primary gap-2" disabled={m.isPending || !body.trim()}>
                  <Send size={15} aria-hidden="true" />{m.isPending ? "Posting…" : "Post"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
