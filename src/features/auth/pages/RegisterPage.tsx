import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { usernameSchema } from "@/validation/profile";
import { friendlyAuthError } from "@/lib/errors";
import { usePublicSettings } from "@/lib/publicSettings";
import { listActiveInstitutions } from "@/features/institutions/api";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(72, "At most 72 characters"),
  displayName: z.string().trim().min(1, "Enter your name").max(60),
  username: usernameSchema,
  institutionId: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function RegisterPage() {
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState("");
  const settings = usePublicSettings();
  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(v: Values) {
    setServerError("");
    const { data: free } = await supabase.rpc("is_username_available", { p_username: v.username });
    if (free === false) { setError("username", { message: "That username is taken" }); return; }
    const { error } = await supabase.auth.signUp({
      email: v.email, password: v.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { username: v.username, display_name: v.displayName, institution_id: v.institutionId || undefined },
      },
    });
    if (error) { setServerError(friendlyAuthError(error.message)); return; }
    setDone(true); // Same message whether or not the email already exists (no account enumeration).
  }

  if (settings.data?.registration_open === false) return (
    <main className="mx-auto max-w-md px-6 py-12"><div className="card space-y-2" role="status"><h1 className="text-xl font-semibold">Registration is paused</h1><p className="text-muted">New accounts cannot be created right now. Please check back later. <Link className="underline" to="/login">Log in</Link></p></div></main>
  );

  if (done) return (
    <main className="mx-auto max-w-md px-6 py-12"><div className="card space-y-2" role="status">
      <h1 className="text-xl font-semibold">Check your email</h1>
      <p className="text-muted">If this address can be registered, we sent a verification link. Open it, then <Link className="underline" to="/login">log in</Link>.</p>
    </div></main>
  );

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Create your account</h1>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="card space-y-4" noValidate>
        <div><label className="label" htmlFor="displayName">Name</label><input id="displayName" className="input" autoComplete="name" {...register("displayName")} />{errors.displayName && <p className="err">{errors.displayName.message}</p>}</div>
        <div><label className="label" htmlFor="username">Username</label><input id="username" className="input" autoComplete="username" autoCapitalize="none" {...register("username")} />{errors.username && <p className="err">{errors.username.message}</p>}</div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" autoComplete="email" {...register("email")} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" autoComplete="new-password" {...register("password")} />{errors.password && <p className="err">{errors.password.message}</p>}</div>
        <div><label className="label" htmlFor="institutionId">Institution (optional)</label>
          <select id="institutionId" className="input" {...register("institutionId")}>
            <option value="">Select later</option>
            {(institutions.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          {institutions.data?.length === 0 && <p className="text-sm text-muted">No institutions have been added yet. You can choose one later.</p>}
          <p className="text-sm text-muted">Your institution is self-reported and not verified.</p></div>
        {serverError && <p role="alert" className="err">{serverError}</p>}
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create account"}</button>
        <p className="text-sm text-muted">Already registered? <Link className="underline" to="/login">Log in</Link></p>
      </form>
    </main>
  );
}
