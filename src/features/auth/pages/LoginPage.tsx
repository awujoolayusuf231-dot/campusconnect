import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { friendlyAuthError } from "@/lib/errors";

const schema = z.object({ email: z.string().trim().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(v: Values) {
    setServerError("");
    const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) { setServerError(friendlyAuthError(error.message)); return; }
    const from = loc.state?.from;
    nav(from && from.startsWith("/") ? from : "/app", { replace: true });
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="card space-y-4" noValidate>
        <div><label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" {...register("email")} />
          {errors.email && <p className="err">{errors.email.message}</p>}</div>
        <div><label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" {...register("password")} />
          {errors.password && <p className="err">{errors.password.message}</p>}</div>
        {serverError && <p role="alert" className="err">{serverError}</p>}
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Log in"}</button>
        <p className="text-sm text-muted"><Link className="underline" to="/forgot-password">Forgot password?</Link> · <Link className="underline" to="/register">Create account</Link></p>
      </form>
    </main>
  );
}
