export function getBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

interface SupabaseAuthClient {
  auth: {
    getUser(jwt: string): Promise<{
      data: { user: { id: string } | null };
      error: { code?: string; status?: number } | null;
    }>;
  };
}

export type SupabaseUserAuthentication =
  | { ok: true; user: { id: string } }
  | { ok: false; reason: "invalid_token"; code?: string; status?: number };

export async function authenticateSupabaseUser(
  accessToken: string,
  client: SupabaseAuthClient,
): Promise<SupabaseUserAuthentication> {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    return { ok: false, reason: "invalid_token", code: error?.code, status: error?.status };
  }
  return { ok: true, user: data.user };
}
