import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { createPost, validateImages } from "../api";
import { socialErrorMessage } from "@/lib/errors";

export function Composer({ communityId }: { communityId?: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [fileError, setFileError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const m = useMutation({
    mutationFn: () => createPost(body, files, communityId),
    onSuccess: ({ failedImages }) => {
      setBody(""); setFiles([]); if (input.current) input.current.value = "";
      setNotice(failedImages ? `Posted, but ${failedImages} image(s) could not be uploaded.` : "Posted!");
      void qc.invalidateQueries({ queryKey: ["feed"] }); void qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });

  function pick(list: FileList | null) {
    const next = Array.from(list ?? []);
    const problem = validateImages(next);
    setFileError(problem ?? ""); setNotice("");
    setFiles(problem ? [] : next);
    if (problem && input.current) input.current.value = "";
  }

  return (
    <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) m.mutate(); }}>
      <label className="label" htmlFor="post-body">Share something with your campus</label>
      <textarea id="post-body" className="input" rows={3} maxLength={2000} placeholder="What's happening?" value={body} onChange={(e) => { setBody(e.target.value); setNotice(""); }} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn cursor-pointer">
          <ImagePlus size={16} className="mr-1" aria-hidden="true" /> Add images
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => pick(e.target.files)} />
        </label>
        {files.length > 0 && <span className="text-sm text-muted">{files.length} image(s) selected</span>}
        <span className="ml-auto text-xs text-muted">{body.length}/2000</span>
        <button className="btn-primary" disabled={m.isPending || !body.trim()}>{m.isPending ? "Posting…" : "Post"}</button>
      </div>
      {fileError && <p role="alert" className="err">{fileError}</p>}
      {m.isError && <p role="alert" className="err">{socialErrorMessage((m.error as Error).message)}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>
  );
}
