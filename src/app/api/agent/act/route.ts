import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { convex } from "@/lib/convex-server";
import { enforceToolCall } from "@/lib/enforcement";
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
 * the agent's tool calls will.
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

  const seam = await enforceToolCall({
    kindeUserId: session.kindeUserId,
    action,
  });

  if (seam.decision === "refuse") {
    return NextResponse.json(
      { decision: seam.decision, reason: seam.reason, correlationId: seam.correlationId },
      { status: 403 },
    );
  }

  let result: unknown;
  switch (action) {
    case "list_resources": {
      result = await convex().query(api.resources.listByOwner, {
        ownerUserId: session.kindeUserId,
      });
      break;
    }
    case "read_resource": {
      if (body.resourceId === undefined) {
        return NextResponse.json({ error: "resourceId required" }, { status: 400 });
      }
      result = await convex().query(api.resources.get, {
        resourceId: body.resourceId as Id<"resources">,
      });
      break;
    }
    case "write_resource": {
      if (body.resourceId === undefined) {
        return NextResponse.json({ error: "resourceId required" }, { status: 400 });
      }
      result = await convex().mutation(api.resources.update, {
        resourceId: body.resourceId as Id<"resources">,
        title: body.title,
        body: body.body,
        updatedByUserId: session.kindeUserId,
      });
      break;
    }
  }

  return NextResponse.json({
    decision: seam.decision,
    correlationId: seam.correlationId,
    result,
  });
}
