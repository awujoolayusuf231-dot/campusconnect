import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        console.error("Could not request a CampusConnect password reset.", error.message);
        setErrorMessage("We couldn’t send the reset link. Check your connection and try again.");
        return;
      }
      setSent(true); // Keep the response identical for registered and unregistered addresses.
    } catch (error) {
      console.error("Password reset request failed.", error);
      setErrorMessage("We couldn’t send the reset link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Reset password</h1>
      {sent ? <p className="card" role="status">If that email is registered, a reset link is on its way. <Link className="underline" to="/login">Back to login</Link></p> : (
        <form onSubmit={(e) => void submit(e)} className="card space-y-4">
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {errorMessage && <p role="alert" className="err">{errorMessage}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>)}
    </main>
  );
}
