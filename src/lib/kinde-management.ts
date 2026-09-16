import { kindeIssuerUrl, kindeM2mConfig } from "./env";

type CachedToken = { accessToken: string; expiresAt: number };
let cachedToken: CachedToken | undefined;

/**
 * Client-credentials token for Kinde's Management API. Cached in memory
 * until shortly before it expires — this is an admin action a person
 * clicks occasionally, not a hot path, so a light cache is enough to avoid
 * minting a fresh token on every click without adding real complexity.
 */
async function m2mAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken !== undefined && cachedToken.expiresAt > now) {
    return cachedToken.accessToken;
  }

  const issuerUrl = kindeIssuerUrl();
  const { clientId, clientSecret } = kindeM2mConfig();

  const response = await fetch(`${issuerUrl}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `${issuerUrl}/api`,
      scope: "update:users",
    }),
  });

  if (!response.ok) {
    throw new Error(`Kinde M2M token request failed: ${response.status}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: body.access_token,
    // Refresh a minute early rather than racing the exact expiry.
    expiresAt: now + (body.expires_in - 60) * 1000,
  };
  return cachedToken.accessToken;
}

/**
 * Suspends a Kinde user through the Management API — the same effect as
 * clicking "Suspend user" in the Kinde dashboard. This does not touch
 * Convex directly: the user only actually becomes offboarded once Kinde's
 * webhook delivers and the seam's own flag flips, same as every other path
 * to offboarding in this build.
 */
export async function suspendKindeUser(kindeUserId: string): Promise<void> {
  const issuerUrl = kindeIssuerUrl();
  const accessToken = await m2mAccessToken();

  const response = await fetch(
    `${issuerUrl}/api/v1/user?id=${encodeURIComponent(kindeUserId)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_suspended: true }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Kinde suspend request failed: ${response.status} ${detail}`);
  }
}
