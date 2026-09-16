import { NextResponse } from "next/server";
import { isRegisteredAction } from "@/lib/action-registry";
import { enforceToolCall } from "@/lib/enforcement";
import { executeResourceAction } from "@/lib/resource-actions";
import { readSessionCookie, decodeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type ActBody = {
  action?: string;
  resourceId?: string;
  title?: string;
  body?: string;
};

/**
 * Test harness for the enforcement seam, ahead of the real agent loop
 * (Phase 4). Every action here goes through enforceToolCall exactly the way
 * the agent's tool calls do.
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

  const body = (await request.json()) as ActBody;
  const action = body.action ?? "";

  const seam = await enforceToolCall({ kindeUserId: session.kindeUserId, action });

  if (seam.decision === "refuse") {
    return NextResponse.json(
      { decision: seam.decision, reason: seam.reason, correlationId: seam.correlationId },
      { status: 403 },
    );
  }

  if (!isRegisteredAction(action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  try {
    const result = await executeResourceAction(action, body, session.kindeUserId);
    return NextResponse.json({
      decision: seam.decision,
      correlationId: seam.correlationId,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
