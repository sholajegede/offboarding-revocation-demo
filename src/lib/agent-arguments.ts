import type { Id } from "../../convex/_generated/dataModel";

/**
 * Normalizes one tool call's input to a plain object. Claude's SDK types
 * tool_use input as unknown, since it's arbitrary JSON shaped by the tool's
 * own schema; anything that isn't itself a plain object yields no fields —
 * the seam and the action handlers decide from there whether what's
 * missing actually matters.
 */
export function normalizeToolInput(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

export function requireResourceId(args: Record<string, unknown>): Id<"resources"> {
  if (typeof args.resourceId !== "string" || args.resourceId.length === 0) {
    throw new Error("resourceId required");
  }
  return args.resourceId as Id<"resources">;
}

export function optionalResourceId(args: Record<string, unknown>): string | undefined {
  return typeof args.resourceId === "string" ? args.resourceId : undefined;
}
