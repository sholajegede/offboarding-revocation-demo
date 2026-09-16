import { NextResponse } from "next/server";
import { runAgentTask } from "@/lib/agent-loop";
import { readSessionCookie, decodeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type RunBody = { task?: string };

/**
 * Kicks off one multi-step agent run for the signed-in user. Every tool
 * call the model makes along the way passes through the same enforcement
 * seam as the /api/agent/act test harness.
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

  const body = (await request.json()) as RunBody;
  const task = body.task?.trim();
  if (task === undefined || task.length === 0) {
    return NextResponse.json({ error: "task required" }, { status: 400 });
  }

  const outcome = await runAgentTask({ kindeUserId: session.kindeUserId, task });
  return NextResponse.json(outcome);
}
