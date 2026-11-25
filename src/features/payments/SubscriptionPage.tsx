import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { LoadingState } from "@/app/LoadingState";
import {
  fetchActiveSubscriptionPlans,
  fetchMySubscription,
  formatSubscriptionPrice,
  startPaystackCheckout,
  verifyPaystackCheckout,
  type BillingInterval,
  type PaidPlanCode,
} from "./api";

function periodName(interval: BillingInterval, count: number): string {
  const label = interval === "month" ? "month" : "year";
  return count === 1 ? label : `${count} ${label}s`;
}

export function SubscriptionPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const attemptedReference = useRef<string | null>(null);
  const reference = searchParams.get("reference");

  const subscription = useQuery({
    queryKey: ["my-subscription"],
    queryFn: fetchMySubscription,
  });
  const plans = useQuery({
    queryKey: ["active-subscription-plans"],
    queryFn: fetchActiveSubscriptionPlans,
  });
  const verify = useMutation({
    mutationFn: verifyPaystackCheckout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("reference");
        return next;
      }, { replace: true });
    },
  });
  const verifyPayment = verify.mutate;
  useEffect(() => {
    if (reference && attemptedReference.current !== reference) {
      attemptedReference.current = reference;
      verifyPayment(reference);
    }
  }, [reference, verifyPayment]);

  const checkout = useMutation({
    mutationFn: ({ planCode, interval }: { planCode: PaidPlanCode; interval: BillingInterval }) =>
      startPaystackCheckout(planCode, interval),
    onSuccess: (url) => window.location.assign(url),
  });

  const currentPaidPlan = subscription.data
    && subscription.data.plan_code !== "free"
    && subscription.data.status !== "expired"
    ? subscription.data.plan_code
    : null;
  const currentPlanActive = currentPaidPlan !== null;
  const availablePlans = (plans.data ?? []).filter((plan) => plan.billing_interval === billingInterval);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <header className="rounded-2xl border border-primary-border bg-gradient-to-r from-primary-soft via-white to-[#fff3f1] px-5 py-5 sm:px-7">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">CampusConnect membership</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">Choose your plan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Payments are securely processed by Paystack. Subscription periods are renewed manually; automatic recurring charges are not enabled.
        </p>
      </header>

      {subscription.isLoading && <LoadingState label="Loading your membership" variant="panel" />}
      {subscription.isError && <p role="alert" className="err">Your membership status could not be loaded.</p>}
      {subscription.data && <section aria-label="Current membership" className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Current plan</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-fg">{subscription.data.display_name}</h2>
            {subscription.data.current_period_end && <p className="mt-1 text-sm text-muted">
              Access through {new Date(subscription.data.current_period_end).toLocaleDateString("en-NG", { dateStyle: "medium" })}
            </p>}
            {subscription.data.status === "canceled" && <p className="mt-1 text-sm text-muted">This plan will not renew automatically.</p>}
          </div>
          {subscription.data.plan_code !== "free" && subscription.data.status !== "expired" &&
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary">
              <CheckCircle2 size={15} aria-hidden="true" /> {subscription.data.status === "canceled" ? "Canceled" : "Active"}
            </span>}
        </div>
      </section>}

      {reference && <section role={verify.isError ? "alert" : "status"} className={`rounded-2xl border p-4 text-sm ${verify.isError ? "border-danger-border bg-danger-soft text-danger" : "border-primary-border bg-white text-fg"}`}>
        {verify.isPending
          ? "Confirming your payment with Paystack…"
          : verify.isError
            ? <><p>We could not confirm this payment yet. Your membership has not been changed.</p>
              <button type="button" className="mt-2 font-semibold underline" onClick={() => verify.mutate(reference)} disabled={verify.isPending}>Try again</button></>
            : "Your payment is confirmed. Your membership status will refresh shortly."}
      </section>}
      {!reference && verify.isSuccess && <p role="status" className="rounded-2xl border border-success-border bg-success-soft p-4 text-sm text-success">
        Payment confirmed. Your membership is active.
      </p>}

      <section className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-fg">Paid plans</h2>
            <p className="mt-1 text-sm text-muted">Select a billing period to compare available plans.</p>
          </div>
          <div className="inline-flex rounded-xl border border-line bg-bg p-1" role="group" aria-label="Billing period">
            {(["month", "year"] as const).map((interval) => <button
              key={interval}
              type="button"
              aria-pressed={billingInterval === interval}
              onClick={() => setBillingInterval(interval)}
              className={`min-h-9 rounded-lg px-3 text-sm font-bold ${billingInterval === interval ? "bg-white text-primary shadow-sm" : "text-muted hover:text-fg"}`}
            >{interval === "month" ? "Monthly" : "Yearly"}</button>)}
          </div>
        </div>

        {plans.isLoading && <LoadingState label="Loading available plans" variant="panel" />}
        {plans.isError && <p role="alert" className="err">Available plans could not be loaded.</p>}
        {plans.data && plans.data.length === 0 && <p className="rounded-xl bg-bg p-4 text-sm text-muted">
          Paid plans are not available yet. Please check back later.
        </p>}
        {plans.data && plans.data.length > 0 && availablePlans.length === 0 &&
          <p className="rounded-xl bg-bg p-4 text-sm text-muted">No plans are configured for this billing period yet.</p>}

        {availablePlans.length > 0 && <div className="grid gap-3 md:grid-cols-2">
          {availablePlans.map((plan) => {
            const tierChangeUnavailable = currentPlanActive && currentPaidPlan !== plan.code;
            const label = checkout.isPending && checkout.variables?.planCode === plan.code
              ? "Connecting to Paystack…"
              : currentPaidPlan === plan.code ? "Extend membership" : "Continue to Paystack";
            return <article key={`${plan.code}-${plan.billing_interval}`} className="flex flex-col rounded-2xl border border-primary-border bg-gradient-to-b from-bg to-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-primary">{plan.display_name}</p>
                  <p className="mt-2 text-2xl font-black text-fg">{formatSubscriptionPrice(plan.amount_minor, plan.currency)}</p>
                  <p className="mt-1 text-xs text-muted">per {periodName(plan.billing_interval, plan.interval_count)}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  {plan.code === "pro" ? <Sparkles size={18} aria-hidden="true" /> : <CreditCard size={18} aria-hidden="true" />}
                </span>
              </div>
              <p className="mt-4 flex-1 text-sm leading-6 text-muted">A {periodName(plan.billing_interval, plan.interval_count)} CampusConnect membership, paid securely through Paystack.</p>
              <button
                type="button"
                className="btn mt-5 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={checkout.isPending || verify.isPending || tierChangeUnavailable}
                onClick={() => checkout.mutate({ planCode: plan.code, interval: plan.billing_interval })}
              >{tierChangeUnavailable ? "Available after current plan ends" : label}</button>
            </article>;
          })}
        </div>}
        {checkout.isError && <p role="alert" className="err">Checkout could not be started. Please try again.</p>}
        {currentPlanActive && <p className="text-xs leading-5 text-muted">
          Plan changes are unavailable while your current paid period is active. You can extend the same plan now or choose another plan after it ends.
        </p>}
      </section>
    </main>
  );
}
