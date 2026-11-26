import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingState } from "@/app/LoadingState";
import { supabase } from "@/lib/supabase";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user.email_confirmed_at) {
        setEmailConfirmed(true);
        setConfirmedEmail(session.user.email ?? null);
      }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not complete the email verification callback.", error.message);
        setFailed(true);
        return;
      }
      if (data.session?.user.email_confirmed_at) {
        setEmailConfirmed(true);
        setConfirmedEmail(data.session.user.email ?? null);
        return;
      }
      navigate("/login", { replace: true, state: { unverified: true } });
    }).catch((error: unknown) => {
      if (!active) return;
      console.error("Email verification callback failed.", error);
      setFailed(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (emailConfirmed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-fg/45 px-4 py-6 backdrop-blur-sm">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-confirmed-title"
          className="w-full max-w-md rounded-3xl border border-line bg-white p-7 text-center shadow-[0_28px_90px_rgba(27,20,20,0.28)] sm:p-9"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 size={34} aria-hidden="true" />
          </div>
          <h1 id="email-confirmed-title" className="mt-5 text-2xl font-black text-fg">
            Email confirmed!
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {confirmedEmail
              ? `Your email address ${confirmedEmail} is confirmed.`
              : "Your email address is confirmed."} Add a few profile details so classmates can find you.
          </p>
          <button
            type="button"
            className="btn-primary mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 px-5"
            onClick={() => navigate("/app/profile/edit", { replace: true })}
          >
            Continue setting up your profile
            <ArrowRight size={17} aria-hidden="true" />
          </button>
          <Link className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline"
            to="/app" replace>
            Go to campus feed
          </Link>
        </section>
      </main>
    );
  }

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
