import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const kindValidator = v.union(
  v.literal("offboard_event"),
  v.literal("seam_decision"),
);
const sourceValidator = v.union(
  v.literal("webhook"),
  v.literal("seam"),
  v.literal("system"),
);
const decisionValidator = v.union(v.literal("allow"), v.literal("refuse"));
const enforcementModeValidator = v.union(
  v.literal("naive"),
  v.literal("enforced"),
);

export const record = mutation({
  args: {
    correlationId: v.string(),
    userId: v.optional(v.string()),
    kind: kindValidator,
    source: sourceValidator,
    action: v.optional(v.string()),
    decision: v.optional(decisionValidator),
    enforcementMode: v.optional(enforcementModeValidator),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLog", { ...args, createdAt: Date.now() });
  },
});

/**
 * Records one webhook delivery, once.
 *
 * The dedup check and the insert run inside the same mutation, so a retried
 * event_id can never race its way into two rows the way a check-then-insert
 * split across two round trips could.
 */
export const recordWebhookEvent = mutation({
  args: {
    eventId: v.string(),
    eventTimestamp: v.string(),
    correlationId: v.string(),
    userId: v.optional(v.string()),
    action: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("auditLog")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing !== null) {
      return { duplicate: true as const, id: existing._id };
    }
    const createdAt = Date.now();
    const parsed = Date.parse(args.eventTimestamp);
    const webhookLatencyMs = Number.isNaN(parsed)
      ? undefined
      : createdAt - parsed;
    const id = await ctx.db.insert("auditLog", {
      ...args,
      kind: "offboard_event",
      source: "webhook",
      webhookLatencyMs,
      createdAt,
    });
    return { duplicate: false as const, id };
  },
});

export const byCorrelationId = query({
  args: { correlationId: v.string() },
  handler: async (ctx, { correlationId }) => {
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_correlationId", (q) =>
        q.eq("correlationId", correlationId),
      )
      .collect();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("auditLog").order("desc").take(limit ?? 50);
  },
});

/**
 * Actions allowed after the acting user's offboardedAt, bucketed by mode.
 * This must read 0 for enforced and can read nonzero for naive.
 */
export const actionsAfterOffboarding = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("auditLog")
      .filter((q) => q.eq(q.field("kind"), "seam_decision"))
      .collect();

    const result = { naive: 0, enforced: 0 };
    for (const row of rows) {
      if (row.decision !== "allow" || row.userId === undefined) continue;
      const user = await ctx.db
        .query("users")
        .withIndex("by_kindeUserId", (q) => q.eq("kindeUserId", row.userId!))
        .unique();
      if (user?.offboardedAt === undefined) continue;
      if (row.createdAt <= user.offboardedAt) continue;
      if (row.enforcementMode === "naive") result.naive += 1;
      else if (row.enforcementMode === "enforced") result.enforced += 1;
    }
    return result;
  },
});
