import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { listMutedUsers, unmuteUser } from "@/features/social/api";
import { NotificationSettings } from "./NotificationSettings";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const mutedUsers = useQuery({ queryKey: ["muted-users"], queryFn: listMutedUsers });
  const unmute = useMutation({
    mutationFn: unmuteUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["muted-users"] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

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
      <NotificationSettings />
      <section className="card space-y-3">
        <h2 className="font-medium">Muted accounts</h2>
        {mutedUsers.isLoading && <p className="text-sm text-muted">Loading muted accounts…</p>}
        {mutedUsers.isError && <p role="alert" className="text-sm text-danger">Could not load muted accounts.</p>}
        {mutedUsers.data?.length === 0 && <p className="text-sm text-muted">You have not muted anyone.</p>}
        {mutedUsers.data && mutedUsers.data.length > 0 && (
          <ul className="divide-y divide-line">
            {mutedUsers.data.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  {user.display_name}{user.username ? <span className="text-muted"> @{user.username}</span> : null}
                </span>
                <button className="btn shrink-0" disabled={unmute.isPending} onClick={() => unmute.mutate(user.id)}>Unmute</button>
              </li>
            ))}
          </ul>
        )}
        {unmute.isError && <p role="alert" className="text-sm text-danger">Could not unmute that account.</p>}
      </section>
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
