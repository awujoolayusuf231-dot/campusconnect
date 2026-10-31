import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { LoadingState } from "@/app/LoadingState";

export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setMsg("Use at least 8 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setMsg("Could not update the password. The link may have expired."); return; }
    nav("/app", { replace: true });
  }
  if (loading) return <LoadingState label="Verifying your password link" variant="page" />;
  if (!session) return <main className="mx-auto max-w-md px-6 py-12"><p className="card">This reset link is invalid or has expired. Request a new one from the login page.</p></main>;
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={(e) => void submit(e)} className="card space-y-4">
        <div><label className="label" htmlFor="pw">New password</label><input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {msg && <p role="alert" className="err">{msg}</p>}
        <button className="btn-primary w-full">Update password</button>
      </form>
    </main>
  );
}
