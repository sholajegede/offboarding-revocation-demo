import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const enforcementModeValidator = v.union(
  v.literal("naive"),
  v.literal("enforced"),
);
const decisionValidator = v.union(v.literal("allow"), v.literal("refuse"));

export const start = mutation({
  args: {
    userId: v.string(),
    task: v.string(),
    enforcementMode: enforcementModeValidator,
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("runs", {
      ...args,
      status: "running",
      startedAt: Date.now(),
    });
  },
});

export const finish = mutation({
  args: {
    runId: v.id("runs"),
    status: v.union(
      v.literal("completed"),
      v.literal("refused"),
      v.literal("errored"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, status, error }) => {
    await ctx.db.patch(runId, { status, error, endedAt: Date.now() });
  },
});

export const recordEvent = mutation({
  args: {
    runId: v.id("runs"),
    stepIndex: v.number(),
    action: v.string(),
    decision: decisionValidator,
    reason: v.string(),
    correlationId: v.string(),
    resourceId: v.optional(v.id("resources")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("runEvents", { ...args, createdAt: Date.now() });
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => ctx.db.get(runId),
});

export const listByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("runs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return rows.sort((a, b) => b.startedAt - a.startedAt);
  },
});

/** The event timeline for one run, oldest first. Console subscribes to this. */
export const timeline = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const rows = await ctx.db
      .query("runEvents")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .collect();
    return rows.sort((a, b) => a.stepIndex - b.stepIndex);
  },
});
