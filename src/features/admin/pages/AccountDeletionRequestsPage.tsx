import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@/app/LoadingState";
import { supabase } from "@/lib/supabase";
import { useMyPermissions } from "../useMyPermissions";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";

type RequestStatus = "pending" | "cancelled" | "completed";
interface DeletionRequest {
  user_id: string;
  status: RequestStatus;
  requested_at: string;
  processed_at: string | null;
}
interface ProfileSummary {
  id: string;
  username: string;
  display_name: string;
}
interface DeletionRequestWithProfile extends DeletionRequest {
  profile: ProfileSummary | null;
}
interface ActionTarget {
  request: DeletionRequestWithProfile;
  action: "delete" | "reject";
}

export function AccountDeletionRequestsPage() {
  const queryClient = useQueryClient();
  const permissions = useMyPermissions();
  const [showAll, setShowAll] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const canView = permissions.data?.includes("users.view") ?? false;
  const canModerate = permissions.data?.includes("users.moderate") ?? false;
  const requests = useQuery({
    queryKey: ["admin", "account-deletion-requests", showAll ? "all" : "pending"],
    enabled: canView,
    queryFn: async (): Promise<DeletionRequestWithProfile[]> => {
      const requestQuery = supabase
        .from("account_deletion_requests")
        .select("user_id,status,requested_at,processed_at")
        .order("requested_at", { ascending: false });
      const { data: requestData, error: requestError } = showAll
        ? await requestQuery
        : await requestQuery.eq("status", "pending");
      if (requestError) throw requestError;

      const rows = (requestData ?? []) as DeletionRequest[];
      if (rows.length === 0) return [];

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,username,display_name")
        .in("id", rows.map((row) => row.user_id));
      if (profileError) throw profileError;

      const profiles = new Map(
        ((profileData ?? []) as ProfileSummary[]).map((profile) => [profile.id, profile]),
      );
      return rows.map((row) => ({ ...row, profile: profiles.get(row.user_id) ?? null }));
    },
  });
  const processRequest = useMutation({
    mutationFn: async ({ request, action }: ActionTarget) => {
      if (action === "delete") {
        const { error } = await supabase.functions.invoke("admin-delete-account", {
          body: { user_id: request.user_id },
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc("admin_reject_account_deletion", {
        p_target: request.user_id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setActionTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "account-deletion-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "stats"] }),
      ]);
    },
  });

  if (permissions.isLoading) return <LoadingState label="Checking deletion-request access" variant="panel" />;
  if (permissions.isError) return <section role="alert" className="card">Could not verify access to deletion requests.</section>;
  if (!canView) return <section role="alert" className="card">You do not have permission to view deletion requests.</section>;
  if (requests.isLoading) return <LoadingState label="Loading account deletion requests" variant="panel" />;
  if (requests.isError) {
    return (
      <section role="alert" className="card">
        <h1 className="font-semibold">Could not load account deletion requests</h1>
        <p className="mt-1 break-words text-sm text-muted">{requests.error.message}</p>
        <button className="btn mt-3" onClick={() => void requests.refetch()}>Try again</button>
      </section>
    );
  }
  const requestRows = requests.data ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Account deletion requests</h1>
          <p className="mt-1 text-sm text-muted">Rejecting keeps the account. Permanent deletion removes the user and cascades associated database records.</p>
        </div>
        <button type="button" className="btn" aria-pressed={showAll} onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show pending only" : "Show all requests"}
        </button>
      </header>

      {requestRows.length === 0 ? (
        <p className="card text-center text-muted">
          {showAll ? "No account deletion requests have been submitted." : "No pending account deletion requests."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="p-3">User</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3">Requested</th>
                <th scope="col" className="p-3">Processed</th>
                {canModerate && <th scope="col" className="p-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requestRows.map((request) => (
                <tr key={request.user_id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{request.profile?.display_name ?? "Profile unavailable"}</div>
                    {request.profile && <div className="text-muted">@{request.profile.username}</div>}
                  </td>
                  <td className="p-3 capitalize">{request.status.replace("_", " ")}</td>
                  <td className="p-3">{new Date(request.requested_at).toLocaleString()}</td>
                  <td className="p-3">{request.processed_at ? new Date(request.processed_at).toLocaleString() : "—"}</td>
                  {canModerate && <td className="p-3">
                    {request.status === "pending" && <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn" onClick={() => { processRequest.reset(); setActionTarget({ request, action: "reject" }); }}>
                        Reject request
                      </button>
                      <button type="button" className="btn-danger" onClick={() => { processRequest.reset(); setActionTarget({ request, action: "delete" }); }}>
                        Delete account
                      </button>
                    </div>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {processRequest.isError && <p role="alert" className="err">{processRequest.error.message}</p>}
      {actionTarget && <ConfirmDialog
        title={actionTarget.action === "delete" ? "Permanently delete this account?" : "Reject this deletion request?"}
        confirmLabel={actionTarget.action === "delete" ? "Delete permanently" : "Reject request"}
        busy={processRequest.isPending}
        onCancel={() => { if (!processRequest.isPending) setActionTarget(null); }}
        onConfirm={() => processRequest.mutate(actionTarget)}
      >
        {actionTarget.action === "delete"
          ? `This permanently deletes ${actionTarget.request.profile?.display_name ?? "this user's"} account and associated database records. This cannot be undone.`
          : `This closes the request and keeps ${actionTarget.request.profile?.display_name ?? "the user's"} account active.`}
      </ConfirmDialog>}
    </div>
  );
}
