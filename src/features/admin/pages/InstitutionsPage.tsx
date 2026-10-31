import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { previewInstitutionCsv, type InstitutionImportPreview } from "@/features/admin/institutionImport";

interface Inst { id: string; name: string; short_name: string | null; type: string; state: string | null; aliases: string[]; is_active: boolean }
const TYPES: [string, string][] = [["university", "University"], ["polytechnic", "Polytechnic"], ["college_of_education", "College of education"], ["other", "Other"]];
const EMPTY = { id: "", name: "", short_name: "", type: "university", state: "", aliases: "" };
const friendly = (m: string) => m.includes("institutions_name_key") || m.includes("duplicate key") ? "An institution with that name already exists." : m.includes("row-level security") || m.includes("permission denied") ? "You do not have permission to manage institutions." : "Please check the fields (name 3+ characters, up to 10 aliases).";
const friendlyImport = (m: string) => m.includes("institutions_name_key") || m.includes("duplicate key") ? "A name was added by someone else after the preview. No institutions from this batch were added; upload the CSV again to refresh duplicate checks." : m.includes("row-level security") || m.includes("permission denied") ? "You do not have permission to manage institutions." : "The batch was not imported. Check the names, types, and fields, then try again.";

// Writes go straight to the table: RLS requires the institutions.manage permission and a trigger writes the audit log.
export function InstitutionsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const [f, setF] = useState(EMPTY);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<InstitutionImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const list = useQuery({ queryKey: ["admin", "institutions"], queryFn: async () => {
    const all: Inst[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("institutions").select("id,name,short_name,type,state,aliases,is_active").order("name").range(from, from + 999);
      if (error) throw error;
      const batch = (data ?? []) as Inst[];
      all.push(...batch);
      if (batch.length < 1000) return all;
    } } });
  const counts = useQuery({ queryKey: ["admin", "institution-counts"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_institution_user_counts"); if (error) throw error; return new Map<string, number>((data ?? []).map((r: { institution_id: string; users: number }) => [r.institution_id, Number(r.users)])); } });
  const shown = (list.data ?? []).filter((i) => !q.trim() || (i.name + " " + (i.short_name ?? "") + " " + i.aliases.join(" ")).toLowerCase().includes(q.trim().toLowerCase()));
  const save = useMutation({ mutationFn: async () => {
    const row = { name: f.name.trim(), short_name: f.short_name.trim() || null, type: f.type, state: f.state.trim() || null, aliases: f.aliases.split(",").map((a) => a.trim()).filter(Boolean) };
    const { error } = f.id ? await supabase.from("institutions").update(row).eq("id", f.id) : await supabase.from("institutions").insert(row); if (error) throw new Error(error.message); },
    onSuccess: () => { setF(EMPTY); void qc.invalidateQueries({ queryKey: ["admin", "institutions"] }); void qc.invalidateQueries({ queryKey: ["institutions"] }); } });
  const bulkImport = useMutation({
    mutationFn: async (preview: InstitutionImportPreview) => {
      const rows = preview.rows.map(({ name, short_name, type, state, aliases }) => ({ name, short_name, type, state, aliases }));
      const { error } = await supabase.from("institutions").insert(rows);
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (count) => {
      setImportPreview(null);
      setImportFileName("");
      setImportError("");
      setImportSuccess(`Successfully added ${count} institution${count === 1 ? "" : "s"}.`);
      void qc.invalidateQueries({ queryKey: ["admin", "institutions"] });
      void qc.invalidateQueries({ queryKey: ["institutions"] });
    },
  });
  async function loadCsv(file: File | undefined) {
    setImportPreview(null);
    setImportError("");
    setImportSuccess("");
    bulkImport.reset();
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setImportError("Choose a CSV file smaller than 2 MB.");
      return;
    }
    try {
      const text = await file.text();
      const preview = previewInstitutionCsv(text, (list.data ?? []).map((institution) => institution.name));
      setImportFileName(file.name);
      setImportPreview(preview);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not read the CSV. Check the file format and try again.");
    }
  }
  const toggle = useMutation({ mutationFn: async (i: Inst) => { const { error } = await supabase.from("institutions").update({ is_active: !i.is_active }).eq("id", i.id); if (error) throw new Error(error.message); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "institutions"] }); void qc.invalidateQueries({ queryKey: ["institutions"] }); } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Institutions</h1>
      <p className="text-sm text-muted">Students choose an institution themselves; it is <strong>not verified</strong>. Deactivating hides it from new selections but keeps existing profiles.</p>
      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Add many institutions at once</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Upload a CSV to review institution names, types, states, and duplicates before adding them. Existing names and duplicates in the file are skipped. Imports are validated together before saving.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="btn inline-flex cursor-pointer gap-2">
            <Upload size={16} aria-hidden="true" />
            Choose CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Choose institution CSV file"
              disabled={list.isLoading || list.isError || bulkImport.isPending}
              onChange={(event) => {
                void loadCsv(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <a className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href="/institution-import-template.csv" download>
            <Download size={16} aria-hidden="true" /> Download CSV template
          </a>
          {list.isLoading && <span role="status" className="text-sm text-muted">Loading current institutions for duplicate checks…</span>}
        </div>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-semibold text-fg">CSV format and official institution directories</summary>
          <div className="mt-2 space-y-2 leading-6">
            <p>Required columns: <code>name,type</code>. Optional columns: <code>short_name,state,aliases</code>. Type must be <code>university</code>, <code>polytechnic</code>, or <code>college_of_education</code>. Separate multiple aliases with a vertical bar (<code>|</code>).</p>
            <p>Use the relevant regulator’s directory and review its current approval/accreditation status before adding names:
              {" "}<a className="font-semibold text-primary underline underline-offset-2" href="https://www.nuc.edu.ng/nigerian-univerisities/" target="_blank" rel="noreferrer">NUC universities</a>,
              {" "}<a className="font-semibold text-primary underline underline-offset-2" href="https://www.digitalnbte.nbte.gov.ng/Public/Institutions?type=polytechnic" target="_blank" rel="noreferrer">NBTE polytechnics</a>,
              {" "}<a className="font-semibold text-primary underline underline-offset-2" href="https://ncce.gov.ng/AccreditedColleges" target="_blank" rel="noreferrer">NCCE accredited colleges</a>.
            </p>
          </div>
        </details>
        {list.isError && <p role="alert" className="err">Could not load the current institution list. Refresh and try again before importing.</p>}
        {importError && <p role="alert" className="err">{importError}</p>}
        {importSuccess && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-900">{importSuccess}</p>}
        {bulkImport.isError && <p role="alert" className="err">{friendlyImport((bulkImport.error as Error).message)}</p>}
        {importPreview && (
          <div className="space-y-3 rounded-xl border border-line bg-[#fffafa] p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-all text-sm font-semibold">{importFileName}</p>
              <p className="text-xs text-muted">{importPreview.rows.length} ready · {importPreview.duplicates.length} duplicates skipped · {importPreview.issues.length} invalid rows</p>
            </div>
            {importPreview.issues.length > 0 && (
              <div role="alert" className="rounded-lg border border-danger/20 bg-white p-3 text-sm">
                <p className="font-semibold text-danger">Fix these rows in the CSV, then choose the file again:</p>
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-muted">
                  {importPreview.issues.slice(0, 20).map((issue) => <li key={issue.rowNumber}>Row {issue.rowNumber}: {issue.message}</li>)}
                  {importPreview.issues.length > 20 && <li>And {importPreview.issues.length - 20} more rows with errors.</li>}
                </ul>
              </div>
            )}
            {importPreview.duplicates.length > 0 && (
              <details className="text-sm text-muted">
                <summary className="cursor-pointer font-semibold">Review skipped duplicates ({importPreview.duplicates.length})</summary>
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto pl-4">
                  {importPreview.duplicates.slice(0, 50).map((duplicate) => <li key={duplicate.rowNumber}>Row {duplicate.rowNumber}: {duplicate.name}</li>)}
                  {importPreview.duplicates.length > 50 && <li>And {importPreview.duplicates.length - 50} more duplicates.</li>}
                </ul>
              </details>
            )}
            <div className="overflow-x-auto rounded-lg border border-line bg-white">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line text-muted"><tr><th className="p-2.5">Name</th><th className="p-2.5">Type</th><th className="p-2.5">State</th><th className="p-2.5">Short name</th></tr></thead>
                <tbody>{importPreview.rows.slice(0, 10).map((row) => <tr key={row.rowNumber} className="border-b border-line last:border-0"><td className="p-2.5">{row.name}</td><td className="p-2.5">{TYPES.find(([type]) => type === row.type)?.[1]}</td><td className="p-2.5">{row.state ?? "—"}</td><td className="p-2.5">{row.short_name ?? "—"}</td></tr>)}</tbody>
              </table>
            </div>
            {importPreview.rows.length > 10 && <p className="text-xs text-muted">Showing the first 10 of {importPreview.rows.length} rows to be added.</p>}
            <button
              type="button"
              className="btn-primary"
              disabled={bulkImport.isPending || importPreview.rows.length === 0 || importPreview.issues.length > 0 || list.isLoading || list.isError}
              onClick={() => bulkImport.mutate(importPreview)}
            >
              {bulkImport.isPending ? "Adding institutions…" : `Add ${importPreview.rows.length} institutions`}
            </button>
          </div>
        )}
      </section>
      <form className="card grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-medium md:col-span-2">{f.id ? "Edit institution" : "Add institution"}</h2>
        <div><label className="label" htmlFor="in">Name</label><input id="in" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="is">Short name</label><input id="is" className="input" value={f.short_name} onChange={(e) => setF({ ...f, short_name: e.target.value })} /></div>
        <div><label className="label" htmlFor="it">Type</label><select id="it" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="ist">State</label><input id="ist" className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="ia">Aliases (comma separated)</label><input id="ia" className="input" value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></div>
        {save.isError && <p role="alert" className="err md:col-span-2">{friendly((save.error as Error).message)}</p>}
        <div className="flex gap-2 md:col-span-2"><button className="btn-primary" disabled={save.isPending || f.name.trim().length < 3}>{f.id ? "Save" : "Add"}</button>{f.id && <button type="button" className="btn" onClick={() => setF(EMPTY)}>Cancel</button>}</div>
      </form>
      <input className="input md:w-72" aria-label="Search institutions" placeholder="Search institutions" value={q} onChange={(e) => setQ(e.target.value)} />
      {toggle.isError && <p role="alert" className="err">{friendly((toggle.error as Error).message)}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted"><tr><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">State</th><th className="p-3">Students</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
        <tbody>{list.isLoading && <tr><td className="p-3" colSpan={6}>Loading…</td></tr>}{shown.length === 0 && !list.isLoading && <tr><td className="p-3 text-muted" colSpan={6}>No institutions yet.</td></tr>}
          {shown.map((i) => <tr key={i.id} className="border-b border-line last:border-0"><td className="p-3"><div className="font-medium">{i.name}</div><div className="text-muted">{[i.short_name, ...i.aliases].filter(Boolean).join(", ")}</div></td>
            <td className="p-3">{TYPES.find(([v]) => v === i.type)?.[1]}</td><td className="p-3">{i.state ?? "—"}</td><td className="p-3">{counts.data?.get(i.id) ?? 0}</td><td className="p-3">{i.is_active ? "Active" : "Inactive"}</td>
            <td className="p-3 text-right space-x-1"><button className="btn" onClick={() => setF({ id: i.id, name: i.name, short_name: i.short_name ?? "", type: i.type, state: i.state ?? "", aliases: i.aliases.join(", ") })}>Edit</button><button className="btn" disabled={toggle.isPending} onClick={() => toggle.mutate(i)}>{i.is_active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
    </div>
  );
}
