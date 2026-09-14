import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SEED_RESOURCES = [
  {
    title: "Q3 renewal notes",
    body: "Customer wants a 10% multi-year discount. Legal has not signed off yet.",
  },
  {
    title: "Onboarding checklist — Acme Corp",
    body: "Kickoff call done. SSO configuration and data import still open.",
  },
  {
    title: "Support escalation — ticket 4821",
    body: "Customer reports intermittent 500s on the export endpoint since Tuesday.",
  },
];

export const listByOwner = query({
  args: { ownerUserId: v.string() },
  handler: async (ctx, { ownerUserId }) => {
    return await ctx.db
      .query("resources")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", ownerUserId))
      .collect();
  },
});

export const get = query({
  args: { resourceId: v.id("resources") },
  handler: async (ctx, { resourceId }) => {
    return await ctx.db.get(resourceId);
  },
});

export const update = mutation({
  args: {
    resourceId: v.id("resources"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    updatedByUserId: v.string(),
  },
  handler: async (ctx, { resourceId, title, body, updatedByUserId }) => {
    const existing = await ctx.db.get(resourceId);
    if (existing === null) throw new Error(`No resource ${resourceId}`);
    await ctx.db.patch(resourceId, {
      ...(title !== undefined ? { title } : {}),
      ...(body !== undefined ? { body } : {}),
      updatedByUserId,
      updatedAt: Date.now(),
    });
    return { resourceId };
  },
});

/** Demo-only: (re)seeds a fixed set of resources for one owner. */
export const seedForOwner = mutation({
  args: { ownerUserId: v.string() },
  handler: async (ctx, { ownerUserId }) => {
    const existing = await ctx.db
      .query("resources")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", ownerUserId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    const updatedAt = Date.now();
    for (const resource of SEED_RESOURCES) {
      await ctx.db.insert("resources", { ...resource, ownerUserId, updatedAt });
    }
    return { seeded: SEED_RESOURCES.length };
  },
});
