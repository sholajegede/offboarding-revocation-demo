import { decodeWebhook, WebhookEventType, type WebhookEvent } from "@kinde/webhooks";
import { kindeIssuerUrl } from "./env";

export type { WebhookEvent };
export { WebhookEventType };

/**
 * Verifies and decodes a Kinde webhook JWT.
 *
 * decodeWebhook resolves to null on a bad signature rather than throwing; a
 * malformed token can still throw, so both are folded into the same null
 * result here. There is exactly one way to read "this call did not verify."
 */
export async function verifyKindeWebhook(
  rawBody: string,
): Promise<WebhookEvent | null> {
  try {
    return await decodeWebhook(rawBody, kindeIssuerUrl());
  } catch {
    return null;
  }
}

export type OffboardClassification = {
  offboarding: boolean;
  reason: string;
};

/**
 * Classifies one verified event against Kinde's real webhook shapes.
 *
 * user.deleted is unambiguous. user.updated is not a diff — Kinde resends the
 * user's full current state — and the only field it carries that signals
 * "this account was cut off" is is_suspended. Removing a user from an org or
 * changing their role also arrives as user.updated, with no dedicated event
 * of its own, and nothing in the payload distinguishes "role changed" from
 * "no change" without a prior snapshot to diff against. That gap is a live
 * Phase 2 finding, not an assumption: BUILD_LOG records what each tested
 * action actually produced.
 */
export function classifyOffboarding(event: WebhookEvent): OffboardClassification {
  if (event.type === WebhookEventType.userDeleted) {
    return { offboarding: true, reason: "user.deleted" };
  }
  if (event.type === WebhookEventType.userUpdated) {
    return event.data.user.is_suspended
      ? { offboarding: true, reason: "user.updated:is_suspended" }
      : { offboarding: false, reason: "user.updated:is_suspended=false" };
  }
  return { offboarding: false, reason: `${event.type}:not_a_user_status_event` };
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * A verified signature only proves Kinde signed this payload at some point —
 * not that it arrived close to when it was signed. A captured, still-valid
 * event replayed for the first time months later would sail past dedup
 * (dedup only catches an event_id already seen) and past signature
 * verification (the signature itself never expires). This closes that gap:
 * anything outside a small window around now is rejected the same way a bad
 * signature is, before it ever reaches classification.
 */
export function isFreshWebhookEvent(
  event: WebhookEvent,
  now: number = Date.now(),
): boolean {
  const eventTime = Date.parse(event.timestamp);
  if (Number.isNaN(eventTime)) return false;
  return Math.abs(now - eventTime) <= MAX_CLOCK_SKEW_MS;
}

/** The Kinde user id an event is about, when the event carries exactly one. */
export function extractKindeUserId(event: WebhookEvent): string | undefined {
  switch (event.type) {
    case WebhookEventType.userCreated:
    case WebhookEventType.userUpdated:
    case WebhookEventType.userDeleted:
    case WebhookEventType.userAuthenticated:
    case WebhookEventType.userAuthenticationFailed:
      return event.data.user.id;
    default:
      return undefined;
  }
}
