import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    kindeUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("offboarded")),
    offboardedAt: v.optional(v.number()),
    offboardedReason: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_kindeUserId", ["kindeUserId"]),

  resources: defineTable({
    title: v.string(),
    body: v.string(),
    ownerUserId: v.string(),
    updatedByUserId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_ownerUserId", ["ownerUserId"]),

  runs: defineTable({
    userId: v.string(),
    task: v.string(),
    enforcementMode: v.union(v.literal("naive"), v.literal("enforced")),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("refused"),
    ),
    correlationId: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_correlationId", ["correlationId"]),

  runEvents: defineTable({
    runId: v.id("runs"),
    stepIndex: v.number(),
    action: v.string(),
    decision: v.union(v.literal("allow"), v.literal("refuse")),
    reason: v.string(),
    correlationId: v.string(),
    resourceId: v.optional(v.id("resources")),
    createdAt: v.number(),
  }).index("by_runId", ["runId"]),

  auditLog: defineTable({
    correlationId: v.string(),
    userId: v.optional(v.string()),
    kind: v.union(v.literal("offboard_event"), v.literal("seam_decision")),
    source: v.union(v.literal("webhook"), v.literal("seam"), v.literal("system")),
    action: v.optional(v.string()),
    decision: v.optional(v.union(v.literal("allow"), v.literal("refuse"))),
    enforcementMode: v.optional(
      v.union(v.literal("naive"), v.literal("enforced")),
    ),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index("by_correlationId", ["correlationId"])
    .index("by_createdAt", ["createdAt"]),
});
