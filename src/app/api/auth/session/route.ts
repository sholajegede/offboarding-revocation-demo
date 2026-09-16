import { NextResponse } from "next/server";
import { verifyKindeToken } from "@/lib/kinde-token";
import { decodeSession, readSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Reports whether the caller is signed in and whether their stored access
 * token still cryptographically verifies. That second field is the
 * token-still-valid gap made visible: it stays true until the token's own
 * expiry, offboarded or not — the seam, not the token, is what stops them.
 */
export async function GET(request: Request) {
  const cookie = readSessionCookie(request);
  if (cookie === undefined) {
    return NextResponse.json({ signedIn: false });
  }

  const session = await decodeSession(cookie);
  if (session === null) {
    return NextResponse.json({ signedIn: false });
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
  });
}
