import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useMyPermissions } from "../useMyPermissions";

interface ContactSyncStats {
  total_eligible: number;
  synced: number;
  failed: number;
  pending: number;
  skipped_missing_email: number;
  skipped_consent: number;
  skipped_unverified: number;
}

interface BackfillResult {
  total_eligible: number;
  queued: number;
  skipped_missing_email: number;
  skipped_consent: number;
  skipped_unverified: number;
}

function count(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString();
}

export function ResendContactsPage() {
  const queryClient = useQueryClient();
  const permissions = useMyPermissions();
  const allowed = permissions.data?.includes("settings.manage") ?? false;
  const stats = useQuery({
    queryKey: ["admin", "resend-contact-sync"],
    enabled: allowed,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_resend_contact_sync_stats");
      if (error) throw error;
      return data as ContactSyncStats;
    },
  });
  const backfill = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_queue_resend_contact_backfill");
      if (error) throw error;
      return data as BackfillResult;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "resend-contact-sync"] }),
  });

  if (permissions.isLoading) return <p className="card">Checking your access…</p>;
  if (permissions.isError) return <p role="alert" className="err">Could not verify access to contact sync.</p>;
  if (!allowed) return <p className="card">Your role does not include Resend contact management.</p>;

  const cards: [string, number | undefined][] = [
    ["Eligible verified opted-in users", stats.data?.total_eligible],
    ["Successfully synchronised", stats.data?.synced],
    ["Failed synchronisations", stats.data?.failed],
    ["Pending or processing", stats.data?.pending],
    ["Skipped · missing email", stats.data?.skipped_missing_email],
    ["Skipped · no consent", stats.data?.skipped_consent],
    ["Skipped · email unverified", stats.data?.skipped_unverified],
  ];

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Resend contact sync</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Sync waits for email verification. Verified users are subscribed to marketing broadcasts only if they explicitly
          opted in; other synced contacts remain unsubscribed. Resend unsubscribe status is preserved on later syncs.
        </p>
      </header>

      <section className="card space-y-3">
        <h2 className="font-medium">Existing-user backfill</h2>
        <p className="text-sm text-muted">
          Queue existing verified users with recorded marketing consent. Users without consent, a verified email, or an
          email address are skipped; the process runs asynchronously and temporary Resend failures are retried.
        </p>
        <button className="btn-primary min-h-10 px-4" disabled={backfill.isPending}
          onClick={() => backfill.mutate()}>
          {backfill.isPending ? "Queueing backfill…" : "Run initial backfill"}
        </button>
        {backfill.isError && <p role="alert" className="err">Backfill could not be queued: {(backfill.error as Error).message}</p>}
        {backfill.data && <p role="status" className="text-sm text-muted">
          Queued {count(backfill.data.queued)} of {count(backfill.data.total_eligible)} eligible users.
          Skipped {count(backfill.data.skipped_missing_email)} without an email and {count(backfill.data.skipped_consent)} without consent.
          {" "}{count(backfill.data.skipped_unverified)} opted-in users have not verified their email.
        </p>}
      </section>

      <section aria-label="Contact sync status">
        {stats.isLoading && <p className="card text-sm text-muted">Loading contact sync totals…</p>}
        {stats.isError && <p role="alert" className="err">Could not load contact sync totals.</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {cards.map(([label, value]) => <div key={label} className="card">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{count(value)}</p>
          </div>)}
        </div>
      </section>
    </div>
  );
}
