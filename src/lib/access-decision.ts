import type { EnforcementMode } from "./env";

export type SeamDecision = "allow" | "refuse";

export type SeamReason =
  | "naive_mode_no_check"
  | "user_active"
  | "user_offboarded"
  | "user_unknown"
  | "unknown_action";

export type UserStatus = "active" | "offboarded" | "unknown";

/**
 * The seam's decision, as pure logic. No tokens, no database, no network —
 * everything that talks to the outside world lives in enforcement.ts and
 * calls into here, so the decision table is directly testable.
 *
 * naive reproduces the hole: it allows without ever looking at userStatus.
 * enforced fails closed on anything but a confirmed-active user, including
 * "unknown" — a status the seam could not resolve is not a pass.
 */
export function decideAccess(input: {
  mode: EnforcementMode;
  userStatus: UserStatus;
}): { decision: SeamDecision; reason: SeamReason } {
  if (input.mode === "naive") {
    return { decision: "allow", reason: "naive_mode_no_check" };
  }
  if (input.userStatus === "active") {
    return { decision: "allow", reason: "user_active" };
  }
  if (input.userStatus === "offboarded") {
    return { decision: "refuse", reason: "user_offboarded" };
  }
  return { decision: "refuse", reason: "user_unknown" };
}
