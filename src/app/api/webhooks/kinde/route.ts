import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { convex } from "@/lib/convex-server";
import {
  classifyOffboarding,
  extractKindeUserId,
  isFreshWebhookEvent,
  verifyKindeWebhook,
} from "@/lib/kinde-webhook";

export const dynamic = "force-dynamic";

/**
 * Kinde webhook receiver.
 *
 * Fails closed on a bad signature or a stale timestamp: no fallback parsing
 * of the raw body, no trusting a claim the token carries before it verifies,
 * no accepting a still-valid signature replayed long after the fact. A
 * Convex write failure returns 5xx rather than 200, so Kinde retries instead
 * of the delivery being silently dropped.
 *
 * The state-changing effect (markOffboarded) runs before the dedup
 * bookkeeping (recordWebhookEvent), not after. markOffboarded is idempotent,
 * so running it again on a retry is always safe; recording the delivery
 * first and applying the effect second is not — a crash between those two
 * steps would let a retry see "already recorded" and skip the effect
 * forever. Idempotent-and-first beats accurate-but-second here.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const event = await verifyKindeWebhook(rawBody);

  if (event === null) {
    try {
      await convex().mutation(api.audit.record, {
        correlationId: randomUUID(),
        kind: "offboard_event",
        source: "webhook",
        reason: "signature_invalid",
      });
    } catch {
      // The rejection itself still stands even if it could not be audited.
    }
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (!isFreshWebhookEvent(event)) {
    try {
      await convex().mutation(api.audit.record, {
        correlationId: randomUUID(),
        kind: "offboard_event",
        source: "webhook",
        reason: "timestamp_stale",
      });
    } catch {
      // Same as above — the rejection stands regardless.
    }
    return NextResponse.json({ error: "stale event" }, { status: 401 });
  }

  const userId = extractKindeUserId(event);
  const classification = classifyOffboarding(event);

  if (classification.offboarding && userId !== undefined) {
    try {
      await convex().mutation(api.users.markOffboarded, {
        kindeUserId: userId,
        reason: classification.reason,
      });
    } catch (error) {
      console.error("[webhook] could not mark user offboarded", error);
      return NextResponse.json({ error: "offboard write failed" }, { status: 503 });
    }
  }

  let result;
  try {
    result = await convex().mutation(api.audit.recordWebhookEvent, {
      eventId: event.event_id,
      eventTimestamp: event.timestamp,
      correlationId: event.event_id,
      userId,
      action: event.type,
      reason: classification.reason,
    });
  } catch (error) {
    console.error("[webhook] could not record delivery", error);
    return NextResponse.json({ error: "audit unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    received: true,
    duplicate: result.duplicate,
    type: event.type,
    offboarding: classification.offboarding,
  });
}
