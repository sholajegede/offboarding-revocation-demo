import { randomUUID } from "node:crypto";
import { api } from "../../convex/_generated/api";
import { convex } from "./convex-server";
import { decideAccess, type SeamDecision, type SeamReason } from "./access-decision";
import { enforcementMode, type EnforcementMode } from "./env";
import { getAction } from "./action-registry";

export type EnforcementResult = {
  decision: SeamDecision;
  reason: SeamReason;
  correlationId: string;
  mode: EnforcementMode;
};

/**
 * The enforcement seam. Every agent action passes through this function, and
 * there is exactly one of these.
 *
 * Order: resolve the action -> resolve the acting user's status -> decide.
 * A Convex read failure resolves to "unknown", not "active" — the seam fails
 * closed on its own outage, not just on a bad status.
 */
export async function enforceToolCall(input: {
  kindeUserId: string;
  action: string;
  correlationId?: string;
}): Promise<EnforcementResult> {
  const correlationId = input.correlationId ?? randomUUID();
  const mode = enforcementMode();

  if (getAction(input.action) === undefined) {
    const result = { decision: "refuse" as const, reason: "unknown_action" as const };
    await recordDecision({ ...input, correlationId, mode, ...result });
    return { ...result, correlationId, mode };
  }

  let userStatus: "active" | "offboarded" | "unknown" = "unknown";
  let offboardedAt: number | undefined;
  try {
    const user = await convex().query(api.users.getByKindeUserId, {
      kindeUserId: input.kindeUserId,
    });
    userStatus = user?.status ?? "unknown";
    offboardedAt = user?.offboardedAt;
  } catch {
    userStatus = "unknown";
  }

  const { decision, reason } = decideAccess({ mode, userStatus });
  const cutoffLatencyMs =
    reason === "user_offboarded" && offboardedAt !== undefined
      ? Date.now() - offboardedAt
      : undefined;
  await recordDecision({ ...input, correlationId, mode, decision, reason, cutoffLatencyMs });
  return { decision, reason, correlationId, mode };
}

async function recordDecision(args: {
  kindeUserId: string;
  action: string;
  correlationId: string;
  mode: EnforcementMode;
  decision: SeamDecision;
  reason: SeamReason;
  cutoffLatencyMs?: number;
}): Promise<void> {
  try {
    await convex().mutation(api.audit.record, {
      correlationId: args.correlationId,
      userId: args.kindeUserId,
      kind: "seam_decision",
      source: "seam",
      action: args.action,
      decision: args.decision,
      enforcementMode: args.mode,
      reason: args.reason,
      cutoffLatencyMs: args.cutoffLatencyMs,
    });
  } catch (error) {
    console.error("[seam] could not record decision", error);
  }
}
