import { NextResponse } from "next/server";
import { enforcementMode } from "@/lib/env";
import { verifyKindeToken } from "@/lib/kinde-token";
import { decodeSession, readSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Reports whether the caller is signed in, whether their stored access
 * token still cryptographically verifies, and which enforcement mode the
 * server is running in. The token-still-valid field stays true until the
 * token's own expiry, offboarded or not — the seam, not the token, is what
 * stops them. enforcementMode is read-only here: the console displays it,
 * nothing lets a client change it.
 */
export async function GET(request: Request) {
  const cookie = readSessionCookie(request);
  if (cookie === undefined) {
    return NextResponse.json({ signedIn: false, enforcementMode: enforcementMode() });
  }

  const session = await decodeSession(cookie);
  if (session === null) {
    return NextResponse.json({ signedIn: false, enforcementMode: enforcementMode() });
  }

  let accessTokenValid: boolean;
  try {
    await verifyKindeToken(session.accessToken);
    accessTokenValid = true;
  } catch {
    accessTokenValid = false;
  }

  return NextResponse.json({
    signedIn: true,
    kindeUserId: session.kindeUserId,
    accessTokenValid,
    enforcementMode: enforcementMode(),
  });
}
