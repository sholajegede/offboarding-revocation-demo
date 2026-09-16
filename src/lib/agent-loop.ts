import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { convex } from "./convex-server";
import { anthropic } from "./anthropic-client";
import { enforceToolCall } from "./enforcement";
import { isRegisteredAction, toAnthropicTools } from "./action-registry";
import { normalizeToolInput, optionalResourceId } from "./agent-arguments";
import { executeResourceAction } from "./resource-actions";
import { anthropicConfig, enforcementMode, type EnforcementMode } from "./env";
import type { SeamDecision, SeamReason } from "./access-decision";

const MAX_ITERATIONS = 8;
const MAX_TOKENS = 1024;

const INSTRUCTIONS = [
  "You are an internal operations assistant acting on behalf of one user.",
  "Use the provided tools to work with that user's resources.",
  "Never invent a resource id — call list_resources first if you don't already have one.",
  "Keep your final summary short and specific to what you found or changed.",
].join(" ");

export type RunStep = {
  stepIndex: number;
  action: string;
  decision: SeamDecision;
  reason: SeamReason;
  resourceId?: string;
};

export type RunOutcome = {
  runId: Id<"runs">;
  correlationId: string;
  status: "completed" | "refused" | "errored";
  steps: RunStep[];
  message?: string;
  refusal?: { action: string; reason: SeamReason };
};

function isToolUse(
  block: Anthropic.ContentBlock,
): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Starts one run: reserves a runId and correlationId in Convex so a caller
 * (the console, a test harness) can subscribe to its live timeline before
 * a single model call has happened. Deliberately just this — the actual
 * work happens in continueAgentRun, so a route handler can respond with
 * the run's identity immediately and let the run play out in the
 * background.
 */
export async function startAgentRun(input: {
  kindeUserId: string;
  task: string;
}): Promise<{ runId: Id<"runs">; correlationId: string; mode: EnforcementMode }> {
  const mode = enforcementMode();
  const correlationId = randomUUID();
  const runId = await convex().mutation(api.runs.start, {
    userId: input.kindeUserId,
    task: input.task,
    enforcementMode: mode,
    correlationId,
  });
  return { runId, correlationId, mode };
}

/**
 * Runs one multi-step agent task against the resource store, entirely
 * through the enforcement seam, against a run already started with
 * startAgentRun.
 *
 * Every tool call the model requests is checked before it runs. The moment
 * one comes back refused, the loop stops right there — no further model
 * calls, no further tool calls. That single-refusal-stops-the-run behavior
 * is the thesis this whole demo exists to prove, so it lives here rather
 * than being left to whichever caller happens to notice a refused decision.
 *
 * Nothing awaits this in the console flow — it runs after the HTTP
 * response has already gone out, so every observable effect goes through
 * Convex, not a return value. A caller that does want the outcome directly
 * (a test harness) can still await it.
 */
export async function continueAgentRun(input: {
  runId: Id<"runs">;
  correlationId: string;
  kindeUserId: string;
  task: string;
  /**
   * Pauses between steps, purely so a human can act during a live
   * demonstration (e.g. offboarding the acting user mid-run). It has no
   * effect on the seam or on cutoffLatencyMs, which is real elapsed time
   * from the moment the user was actually flagged offboarded — this only
   * slows down how fast the model reaches its next tool call. Defaults to
   * 0, so normal runs are unaffected.
   */
  stepDelayMs?: number;
}): Promise<RunOutcome> {
  const { runId, correlationId } = input;

  try {
    const { model } = anthropicConfig();
    const client = anthropic();
    const tools = toAnthropicTools();

    const steps: RunStep[] = [];
    let stepIndex = 0;

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: input.task },
    ];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: INSTRUCTIONS,
        messages,
        tools,
      });

      messages.push({ role: "assistant", content: response.content });

      const calls = response.content.filter(isToolUse);

      if (response.stop_reason !== "tool_use" || calls.length === 0) {
        await convex().mutation(api.runs.finish, { runId, status: "completed" });
        return {
          runId,
          correlationId,
          status: "completed",
          steps,
          message: textFrom(response.content),
        };
      }

      const outputs: Anthropic.ToolResultBlockParam[] = [];

      for (const call of calls) {
        stepIndex += 1;
        const args = normalizeToolInput(call.input);
        const resourceId = optionalResourceId(args);

        const seam = await enforceToolCall({
          kindeUserId: input.kindeUserId,
          action: call.name,
          correlationId,
        });

        await convex().mutation(api.runs.recordEvent, {
          runId,
          stepIndex,
          action: call.name,
          decision: seam.decision,
          reason: seam.reason,
          correlationId,
          resourceId: resourceId as Id<"resources"> | undefined,
        });

        steps.push({
          stepIndex,
          action: call.name,
          decision: seam.decision,
          reason: seam.reason,
          resourceId,
        });

        if (seam.decision === "refuse") {
          await convex().mutation(api.runs.finish, { runId, status: "refused" });
          return {
            runId,
            correlationId,
            status: "refused",
            steps,
            refusal: { action: call.name, reason: seam.reason },
          };
        }

        if (!isRegisteredAction(call.name)) {
          // The seam only allows registered actions, so this is unreachable
          // — guarded anyway so the executor below never runs on faith.
          throw new Error(`Allowed action is not registered: ${call.name}`);
        }

        const result = await executeResourceAction(call.name, args, input.kindeUserId);
        outputs.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: outputs });

      if (input.stepDelayMs !== undefined && input.stepDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, input.stepDelayMs));
      }
    }

    await convex().mutation(api.runs.finish, { runId, status: "completed" });
    return {
      runId,
      correlationId,
      status: "completed",
      steps,
      message: "Stopped after reaching the step limit.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "run failed";
    try {
      await convex().mutation(api.runs.finish, { runId, status: "errored", error: message });
    } catch (finishError) {
      console.error("[agent-loop] could not record run failure", finishError);
    }
    return { runId, correlationId, status: "errored", steps: [], message };
  }
}
