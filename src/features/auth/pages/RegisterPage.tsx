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
import { AuthPageLayout } from "@/features/auth/AuthPageLayout";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";

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
    <AuthPageLayout mode="register" eyebrow="Your campus community awaits" title="Find your people." description="Create an account to connect, join communities, and discover opportunities made for student life.">
      <div className="rounded-2xl border border-line bg-bg p-5" role="status"><h2 className="font-bold text-fg">Registration is paused</h2><p className="mt-2 text-sm leading-6 text-muted">New accounts cannot be created right now. Please check back later. <Link className="font-semibold text-primary underline" to="/login">Log in</Link></p></div>
    </AuthPageLayout>
  );

  if (done) return (
    <AuthPageLayout mode="register" eyebrow="Almost there" title="Check your email." description="We’ve sent a verification link if this address can be registered.">
      <div className="rounded-2xl border border-line bg-bg p-5" role="status">
        <p className="text-sm leading-6 text-muted">Open the verification link in your inbox, then <Link className="font-semibold text-primary underline" to="/login">log in</Link> to join your campus.</p>
      </div>
    </AuthPageLayout>
  );

  return (
    <AuthPageLayout mode="register" eyebrow="Your campus community awaits" title="Find your people." description="Create an account to connect, join communities, and discover opportunities made for student life.">
      <div className="space-y-4">
        <GoogleSignInButton redirectTo={`${window.location.origin}/app`} disabled={isSubmitting} />
        <div className="flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-line" /><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">or sign up with email</span><span className="h-px flex-1 bg-line" /></div>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3.5" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="displayName">Your name</label><input id="displayName" className="input" autoComplete="name" placeholder="Ada Okafor" {...register("displayName")} />{errors.displayName && <p className="err">{errors.displayName.message}</p>}</div>
            <div><label className="label" htmlFor="username">Username</label><input id="username" className="input" autoComplete="username" autoCapitalize="none" placeholder="ada_okafor" {...register("username")} />{errors.username && <p className="err">{errors.username.message}</p>}</div>
          </div>
          <div><label className="label" htmlFor="email">Email address</label><input id="email" type="email" className="input" autoComplete="email" placeholder="you@example.com" {...register("email")} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
          <div><label className="label" htmlFor="password">Create a password</label><input id="password" type="password" className="input" autoComplete="new-password" placeholder="At least 8 characters" {...register("password")} />{errors.password && <p className="err">{errors.password.message}</p>}</div>
          <div><label className="label" htmlFor="institutionId">Institution (optional)</label>
            <select id="institutionId" className="input" {...register("institutionId")}>
              <option value="">Choose later</option>
              {(institutions.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {institutions.data?.length === 0 && <p className="mt-1 text-xs text-muted">No institutions have been added yet. You can choose one later.</p>}
            <p className="mt-1 text-xs text-muted">Institution details are self-reported and not verified.</p></div>
          {serverError && <p role="alert" className="err">{serverError}</p>}
          <button className="btn-primary min-h-11 w-full" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create your account"}</button>
          <p className="text-center text-sm text-muted">Already part of the community? <Link className="font-bold text-primary hover:underline" to="/login">Log in</Link></p>
        </form>
      </div>
    </AuthPageLayout>
  );
}
