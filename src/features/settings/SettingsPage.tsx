import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function SettingsPage() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setMsg("Use at least 8 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? "Could not update the password." : "Password updated."); setPw("");
  }
  async function requestDeletion() {
    const { error } = await supabase.rpc("request_account_deletion");
    setMsg(error ? "Could not submit the request." : "Deletion requested. Staff will process it; you can cancel by contacting support.");
    setConfirming(false);
  }
  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-10">
      <Link to="/app" className="text-sm underline">← Back</Link>
      <h1 className="text-2xl font-semibold">Account settings</h1>
      <form onSubmit={(e) => void changePassword(e)} className="card space-y-3">
        <label className="label" htmlFor="pw">New password</label>
        <input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn-primary">Update password</button>
      </form>
      <section className="card space-y-3">
        <h2 className="font-medium">Delete account</h2>
        <p className="text-sm text-muted">Submits a deletion request. Your data is not removed instantly.</p>
        {confirming ? (
          <div className="flex gap-2"><button className="btn-danger" onClick={() => void requestDeletion()}>Yes, request deletion</button><button className="btn" onClick={() => setConfirming(false)}>Cancel</button></div>
        ) : <button className="btn" onClick={() => setConfirming(true)}>Request account deletion</button>}
      </section>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </main>
  );
}
