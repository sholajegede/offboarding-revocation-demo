import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByKindeUserId = query({
  args: { kindeUserId: v.string() },
  handler: async (ctx, { kindeUserId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_kindeUserId", (q) => q.eq("kindeUserId", kindeUserId))
      .unique();
  },
});

/** True only when the user is known and active. Unknown fails closed. */
export const isActive = query({
  args: { kindeUserId: v.string() },
  handler: async (ctx, { kindeUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_kindeUserId", (q) => q.eq("kindeUserId", kindeUserId))
      .unique();
    return user?.status === "active";
  },
});

/** Every user Convex currently believes is active — the reconciliation sweep's input. */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    kindeUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { kindeUserId, email, name }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_kindeUserId", (q) => q.eq("kindeUserId", kindeUserId))
      .unique();
    const updatedAt = Date.now();
    if (existing === null) {
      return await ctx.db.insert("users", {
        kindeUserId,
        email,
        name,
        status: "active",
        updatedAt,
      });
    }
    await ctx.db.patch(existing._id, { email, name, updatedAt });
    return existing._id;
  },
});

/**
 * Marks a user offboarded. Idempotent — a duplicate or replayed webhook
 * event must not overwrite the original offboardedAt.
 */
export const markOffboarded = mutation({
  args: { kindeUserId: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { kindeUserId, reason }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_kindeUserId", (q) => q.eq("kindeUserId", kindeUserId))
      .unique();
    const now = Date.now();
    if (existing === null) {
      const id = await ctx.db.insert("users", {
        kindeUserId,
        status: "offboarded",
        offboardedAt: now,
        offboardedReason: reason,
        updatedAt: now,
      });
      return { id, alreadyOffboarded: false, offboardedAt: now };
    }
    if (existing.status === "offboarded") {
      return {
        id: existing._id,
        alreadyOffboarded: true,
        offboardedAt: existing.offboardedAt,
      };
    }
    await ctx.db.patch(existing._id, {
      status: "offboarded",
      offboardedAt: now,
      offboardedReason: reason,
      updatedAt: now,
    });
    return { id: existing._id, alreadyOffboarded: false, offboardedAt: now };
  },
});

/** Demo-only: restores a user to active so a scenario can be re-run. */
export const reactivate = mutation({
  args: { kindeUserId: v.string() },
  handler: async (ctx, { kindeUserId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_kindeUserId", (q) => q.eq("kindeUserId", kindeUserId))
      .unique();
    if (existing === null) throw new Error(`No user ${kindeUserId}`);
    await ctx.db.patch(existing._id, {
      status: "active",
      offboardedAt: undefined,
      offboardedReason: undefined,
      updatedAt: Date.now(),
    });
    return { id: existing._id };
  },
});
