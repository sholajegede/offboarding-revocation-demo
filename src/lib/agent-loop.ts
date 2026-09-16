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
import { anthropicConfig, enforcementMode } from "./env";
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
  runId: string;
  correlationId: string;
  status: "completed" | "refused";
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
 * Runs one multi-step agent task against the resource store, entirely
 * through the enforcement seam.
 *
 * Every tool call the model requests is checked before it runs. The moment
 * one comes back refused, the loop stops right there — no further model
 * calls, no further tool calls. That single-refusal-stops-the-run behavior
 * is the thesis this whole demo exists to prove, so it lives here rather
 * than being left to whichever caller happens to notice a refused decision.
 */
export async function runAgentTask(input: {
  kindeUserId: string;
  task: string;
}): Promise<RunOutcome> {
  const mode = enforcementMode();
  const correlationId = randomUUID();
  const { model } = anthropicConfig();
  const client = anthropic();
  const tools = toAnthropicTools();

  const runId = await convex().mutation(api.runs.start, {
    userId: input.kindeUserId,
    task: input.task,
    enforcementMode: mode,
    correlationId,
  });

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
        // The seam only allows registered actions, so this is unreachable —
        // guarded anyway so the executor below never runs on faith.
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
  }

  await convex().mutation(api.runs.finish, { runId, status: "completed" });
  return {
    runId,
    correlationId,
    status: "completed",
    steps,
    message: "Stopped after reaching the step limit.",
  };
}
