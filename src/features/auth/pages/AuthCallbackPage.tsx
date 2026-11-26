import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingState } from "@/app/LoadingState";
import { supabase } from "@/lib/supabase";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not complete the email verification callback.", error.message);
        setFailed(true);
        return;
      }
      if (data.session?.user.email_confirmed_at) {
        navigate("/app", { replace: true });
        return;
      }
      navigate("/login", { replace: true, state: { unverified: true } });
    }).catch((error: unknown) => {
      if (!active) return;
      console.error("Email verification callback failed.", error);
      setFailed(true);
    });
    return () => { active = false; };
  }, [navigate]);

  if (!failed) return <LoadingState label="Verifying your email" variant="page" />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-black text-fg">We couldn’t verify your email</h1>
        <p className="mt-2 text-sm leading-6 text-muted">The link may have expired. Return to sign in and request a new verification email.</p>
        <Link className="btn-primary mt-5 inline-flex min-h-11 items-center justify-center px-5" to="/login">Return to log in</Link>
      </section>
    </main>
  );
}
