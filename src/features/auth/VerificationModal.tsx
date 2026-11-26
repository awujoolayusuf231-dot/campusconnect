import { useEffect, useState, type FormEvent } from "react";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { ArrowRight, GraduationCap, MailCheck, Pencil, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { friendlyAuthError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

const RESEND_COOLDOWN_SECONDS = 60;
const CALLBACK_PATH = "/auth/callback";

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

async function correctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsFetchError) {
    console.error("Could not reach the unverified-signup email correction function.", error.message);
    return "Could not reach the secure email correction service. Check your connection or try again later.";
  }
  if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError) {
    const response = error.context;
    if (response instanceof Response) {
      let code: string | undefined;
      try {
        const body: unknown = JSON.parse(await response.clone().text());
        if (typeof body === "object" && body !== null) {
          if ("error" in body && typeof body.error === "string") code = body.error;
          else if ("code" in body && typeof body.code === "string") code = body.code;
        }
      } catch (parseError) {
        if (!(parseError instanceof SyntaxError)) throw parseError;
      }
      console.error("Unverified-signup email correction was rejected.", { status: response.status, code });
      if (!code && response.status >= 500) {
        return "The email correction service could not complete the update. Try again later; if it continues, contact CampusConnect support.";
      }
      if (!code && response.status === 401) {
        return "Check the original signup email and password. Email correction is available only before verification.";
      }
      if (!code && response.status === 429) {
        return "Too many correction attempts. Wait 15 minutes before trying again.";
      }
      switch (code) {
        case "invalid_credentials":
          return "Check the original signup email and password. Email correction is available only before verification.";
        case "too_many_attempts":
          return "Too many correction attempts. Wait 15 minutes before trying again.";
        case "email_unavailable":
          return "That email address is already associated with another account.";
        case "email_correction_unavailable":
          return "Email correction is temporarily unavailable. Try again later.";
        case "email_update_failed":
          return "We verified your signup details, but could not update the email address. Try again later or contact CampusConnect support.";
        case "invalid_request":
          return "Check the new email address and try again. Email correction is available only before verification.";
        default:
          return "We could not update that email address. Try again or contact CampusConnect support.";
      }
    }
  }
  console.error("Unexpected unverified-signup email correction error.", error);
  return "We could not update that email address. Try again or contact CampusConnect support.";
}

export function VerificationModal({
  email,
  userId,
  onEmailUpdated,
  onCancel,
}: {
  email: string;
  userId: string | null;
  onEmailUpdated: (email: string) => void;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const [currentEmail, setCurrentEmail] = useState(email);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.email_confirmed_at) navigate(CALLBACK_PATH, { replace: true });
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        console.error("Could not check the verified signup session.", sessionError.message);
        return;
      }
      if (data.session?.user.email_confirmed_at) navigate(CALLBACK_PATH, { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resendVerification(targetEmail = currentEmail) {
    setError("");
    setSuccess("");
    setIsResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail,
        options: { emailRedirectTo: `${window.location.origin}${CALLBACK_PATH}` },
      });
      if (resendError) {
        setError(friendlyAuthError(resendError.message));
        return false;
      }
      setSuccess("A fresh verification link is on its way. Check your inbox and spam folder.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      return true;
    } catch (resendError) {
      console.error("Could not resend the signup verification email.", resendError);
      setError("Could not send a verification link. Check your connection and try again.");
      return false;
    } finally {
      setIsResending(false);
    }
  }

  async function correctEmail(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!userId) {
      setError("We could not verify this pending signup. Please contact CampusConnect support.");
      return;
    }
    if (!signupPassword) {
      setError("Enter the password you used when you signed up.");
      return;
    }

    setIsCorrecting(true);
    try {
      const { data, error: correctionError } = await supabase.functions.invoke("correct-unverified-signup-email", {
        body: {
          user_id: userId,
          current_email: currentEmail,
          new_email: normalizedEmail,
          password: signupPassword,
        },
      });
      if (correctionError) {
        setError(await correctionErrorMessage(correctionError));
        return;
      }
      if (!data?.email_updated) {
        setError("We could not confirm the email change. Try again or contact support.");
        return;
      }

      setCurrentEmail(normalizedEmail);
      onEmailUpdated(normalizedEmail);
      setSignupPassword("");
      setNewEmail("");
      setIsEditingEmail(false);
      setCooldown(0);
      const sent = await resendVerification(normalizedEmail);
      if (!sent) setError("Your email address was updated, but we could not send the link. Use Resend verification email to try again.");
    } catch (correctionError) {
      console.error("Unverified-signup email correction request failed.", correctionError);
      setError("We could not update that email address. Check your connection and try again.");
    } finally {
      setIsCorrecting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-fg/45 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-title"
        className="my-auto w-full max-w-[430px] overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_28px_90px_rgba(27,20,20,0.28)] sm:rounded-[30px]"
      >
        <div className="h-1.5 bg-gradient-to-r from-primary-deep via-primary to-[#ea8a78]" />
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-[0_5px_12px_rgba(197,43,58,0.2)]">
                <GraduationCap size={20} aria-hidden="true" />
              </span>
              <span className="text-base font-black tracking-tight text-fg">Campus<span className="text-primary">Connect</span></span>
            </div>
            <button
              type="button"
              className="min-h-10 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-bg hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCorrecting || isResending}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>

          <div className="mx-auto mt-5 flex h-[68px] w-[68px] items-center justify-center rounded-[22px] bg-primary-soft text-primary">
            <MailCheck size={34} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <h1 id="verification-title" className="mt-4 text-center text-2xl font-black tracking-tight text-fg sm:text-[28px]">
            Verify your email
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-muted">
            If this address can be registered, a secure verification link is on its way.
          </p>

          <div className="mt-4 rounded-2xl border border-primary-border bg-primary-soft/60 px-4 py-3 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Verification email</p>
            <p className="mt-1 break-all text-sm font-bold text-fg">{currentEmail}</p>
          </div>

          <ol className="mt-4 space-y-2.5 text-sm leading-5 text-muted">
            <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-white">1</span><span>Open the email from CampusConnect.</span></li>
            <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-white">2</span><span>Select <strong className="text-fg">Verify my email</strong> to securely enter your account.</span></li>
          </ol>

          {success && <p role="status" className="mt-4 rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm leading-5 text-success">{success}</p>}
          {error && <p role="alert" className="mt-4 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm leading-5 text-danger">{error}</p>}

          {!isEditingEmail ? (
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                className="btn-primary min-h-11 w-full justify-center gap-2"
                disabled={isResending || cooldown > 0}
                onClick={() => void resendVerification()}
              >
                <Send size={16} aria-hidden="true" />
                {isResending ? "Sending verification email…" : cooldown > 0 ? `Resend in ${formatCountdown(cooldown)}` : "Resend verification email"}
              </button>
              <button
                type="button"
                className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary transition hover:bg-primary-soft"
                onClick={() => { setError(""); setSuccess(""); setIsEditingEmail(true); }}
              >
                <Pencil size={14} aria-hidden="true" /> Wrong email? Correct it
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void correctEmail(event)} className="mt-5 space-y-3">
              <div>
                <label htmlFor="correct-signup-email" className="label">Correct email address</label>
                <input
                  id="correct-signup-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="signup-confirm-password" className="label">Signup password</label>
                <input
                  id="signup-confirm-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={signupPassword}
                  onChange={(event) => setSignupPassword(event.target.value)}
                />
                <p className="mt-1 text-xs leading-5 text-muted">We verify your password before changing the pending account’s email.</p>
              </div>
              <button className="btn-primary min-h-11 w-full justify-center gap-2" disabled={isCorrecting || isResending}>
                {isCorrecting ? "Updating email…" : <>Update email and resend <ArrowRight size={16} aria-hidden="true" /></>}
              </button>
              <button
                type="button"
                className="min-h-10 w-full rounded-xl px-3 text-sm font-semibold text-muted hover:bg-bg hover:text-fg"
                disabled={isCorrecting || isResending}
                onClick={() => { setError(""); setIsEditingEmail(false); setNewEmail(""); setSignupPassword(""); }}
              >
                Keep current email
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-xs leading-5 text-muted">
            No email yet? Check your spam folder. This confirmation helps keep your CampusConnect account secure.
          </p>
        </div>
      </section>
    </div>
  );
}
