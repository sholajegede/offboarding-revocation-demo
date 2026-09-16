import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";

async function kindeM2mToken(
  issuerUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const response = await fetch(`${issuerUrl}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `${issuerUrl}/api`,
      scope: "read:users",
    }),
  });
  if (!response.ok) {
    throw new Error(`Kinde M2M token request failed: ${response.status}`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function isSuspendedInKinde(
  issuerUrl: string,
  accessToken: string,
  kindeUserId: string,
): Promise<boolean> {
  const response = await fetch(
    `${issuerUrl}/api/v1/user?id=${encodeURIComponent(kindeUserId)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Kinde user lookup failed: ${response.status}`);
  }
  const body = (await response.json()) as { is_suspended?: boolean };
  return body.is_suspended === true;
}

/**
 * Backstop for a webhook that never arrives.
 *
 * The webhook stays the primary, fast path to offboarding — this is not a
 * replacement for it, only a slower net underneath it. On a cadence set by
 * convex/crons.ts, it asks Kinde directly whether each user Convex still
 * believes is active has actually been suspended, and corrects any drift it
 * finds. A user who really is active costs one Kinde API call per sweep;
 * there is no other way to notice a webhook that was dropped, delayed past
 * its retry window, or never sent in the first place.
 *
 * Requires KINDE_ISSUER_URL, KINDE_M2M_CLIENT_ID, and KINDE_M2M_CLIENT_SECRET
 * set on this Convex deployment (via `npx convex env set`) — these are
 * separate from the same-named variables in the Next.js app's .env.local,
 * because this code runs on Convex's infrastructure, not Next's. The M2M
 * application in Kinde also needs the read:users scope authorized, not just
 * update:users.
 */
export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; corrected: number }> => {
    const issuerUrl = process.env.KINDE_ISSUER_URL?.replace(/\/+$/, "");
    const clientId = process.env.KINDE_M2M_CLIENT_ID;
    const clientSecret = process.env.KINDE_M2M_CLIENT_SECRET;

    if (issuerUrl === undefined || clientId === undefined || clientSecret === undefined) {
      console.error(
        "[reconciliation] KINDE_ISSUER_URL / KINDE_M2M_CLIENT_ID / KINDE_M2M_CLIENT_SECRET not set on this Convex deployment — sweep skipped",
      );
      return { checked: 0, corrected: 0 };
    }

    const activeUsers = await ctx.runQuery(api.users.listActive, {});
    if (activeUsers.length === 0) {
      return { checked: 0, corrected: 0 };
    }

    const accessToken = await kindeM2mToken(issuerUrl, clientId, clientSecret);

    let corrected = 0;
    for (const user of activeUsers) {
      let suspended: boolean;
      try {
        suspended = await isSuspendedInKinde(issuerUrl, accessToken, user.kindeUserId);
      } catch (error) {
        console.error(`[reconciliation] could not check ${user.kindeUserId}`, error);
        continue;
      }
      if (!suspended) continue;

      await ctx.runMutation(api.users.markOffboarded, {
        kindeUserId: user.kindeUserId,
        reason: "reconciliation_drift",
      });
      await ctx.runMutation(api.audit.record, {
        correlationId: crypto.randomUUID(),
        userId: user.kindeUserId,
        kind: "offboard_event",
        source: "system",
        reason: "reconciliation_drift",
      });
      corrected += 1;
    }

    return { checked: activeUsers.length, corrected };
  },
});
