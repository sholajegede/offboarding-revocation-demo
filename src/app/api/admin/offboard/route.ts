import { NextResponse } from "next/server";
import { suspendKindeUser } from "@/lib/kinde-management";
import { decodeSession, readSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Lets the signed-in user offboard only themselves — a demo control, not a
 * general admin endpoint. It calls the real Kinde Management API, the same
 * action as clicking "Suspend user" in the dashboard, so the rest of the
 * flow (webhook, seam, cutoff) plays out exactly as it would in production.
 */
export async function POST(request: Request) {
  const cookie = readSessionCookie(request);
  if (cookie === undefined) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const session = await decodeSession(cookie);
  if (session === null) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  try {
    await suspendKindeUser(session.kindeUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "suspend failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ suspended: true });
}
