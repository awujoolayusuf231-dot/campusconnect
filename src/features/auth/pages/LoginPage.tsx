import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { friendlyAuthError } from "@/lib/errors";
import { AuthPageLayout } from "@/features/auth/AuthPageLayout";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
import { PasswordInput } from "@/features/auth/PasswordInput";

const schema = z.object({ email: z.string().trim().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string; unverified?: boolean } };
  const [serverError, setServerError] = useState(loc.state?.unverified ? "Please verify your email address before continuing." : "");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Could not check the existing login session.", error.message);
        return;
      }
      if (active && data.session?.user.email_confirmed_at) nav("/app", { replace: true });
    }).catch((error: unknown) => {
      if (active) console.error("Could not read the existing login session.", error);
    });
    return () => { active = false; };
  }, [nav]);

  async function onSubmit(v: Values) {
    setServerError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) { setServerError(friendlyAuthError(error.message)); return; }
    if (!data.session?.user.email_confirmed_at) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) console.error("Could not clear the unverified login session.", signOutError.message);
      setServerError("Please verify your email address before continuing.");
      return;
    }
    const from = loc.state?.from;
    nav(from && from.startsWith("/") ? from : "/app", { replace: true });
  }

  return (
    <AuthPageLayout mode="login" eyebrow="Welcome back" title="Good to see you again." description="Log in and pick up where your campus story left off.">
      <div className="space-y-5">
        <GoogleSignInButton redirectTo={`${window.location.origin}/app`} disabled={isSubmitting} />
        <div className="flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-line" /><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">or use email</span><span className="h-px flex-1 bg-line" /></div>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
          <div><label className="label" htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" placeholder="you@example.com" className="input" {...register("email")} />
            {errors.email && <p className="err">{errors.email.message}</p>}</div>
          <div><div className="mb-1 flex items-center justify-between"><label className="label mb-0" htmlFor="password">Password</label><Link className="text-xs font-semibold text-primary hover:underline" to="/forgot-password">Forgot password?</Link></div>
            <PasswordInput id="password" autoComplete="current-password" placeholder="Enter your password" {...register("password")} />
            {errors.password && <p className="err">{errors.password.message}</p>}</div>
          {serverError && <p role="alert" className="err">{serverError}</p>}
          <button className="btn-primary min-h-11 w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Log in to CampusConnect"}</button>
          <p className="text-center text-sm text-muted">New to CampusConnect? <Link className="font-bold text-primary hover:underline" to="/register">Create your account</Link></p>
        </form>
      </div>
    </AuthPageLayout>
  );
}
