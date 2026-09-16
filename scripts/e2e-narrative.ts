import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A plain .env.local reader, not dotenv — this script is the only thing in
 * the repo that runs outside Next's own env loading, so it needs to bring
 * its own. Every getter in src/lib/env.ts reads process.env lazily, at call
 * time, so this only has to run before main() does anything, not before
 * the imports below are evaluated.
 */
function loadEnvLocal(): void {
  const path = resolve(__dirname, "..", ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

import { api } from "../convex/_generated/api";
import { convex } from "../src/lib/convex-server";
import { startAgentRun, continueAgentRun, type RunOutcome } from "../src/lib/agent-loop";
import { suspendKindeUser, restoreKindeUser } from "../src/lib/kinde-management";
import { e2eKindeUserId, type EnforcementMode } from "../src/lib/env";

/**
 * Proves the thesis end to end, in both directions, against real
 * infrastructure — a real Kinde suspend, the real webhook over whatever
 * tunnel is configured, real Convex state, a real agent run. Nothing here
 * is mocked or stubbed: requires `npm run dev` and `npx convex dev` both
 * already running, with the webhook reachable, exactly like every other
 * live test in this build.
 *
 * Runs the same three-step task twice against the same test user — once
 * per mode — offboarding that user partway through each run and checking
 * what happened afterward. Naive is expected to fail this check (RED,
 * proving the vulnerability); enforced is expected to pass it (GREEN,
 * proving the fix). Exits non-zero if either side doesn't behave as
 * expected, so a slip in either direction is a real, catchable failure.
 */
const TASK =
  "List your resources. Then read the first resource. Then read the second resource. Reply with one short sentence when done.";

const POLL_INTERVAL_MS = 200;

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, POLL_INTERVAL_MS));
  }
}

async function ensureUserActive(kindeUserId: string): Promise<void> {
  const existing = await convex().query(api.users.getByKindeUserId, { kindeUserId });
  if (existing === null) {
    await convex().mutation(api.users.upsert, { kindeUserId });
  } else if (existing.status === "offboarded") {
    await convex().mutation(api.users.reactivate, { kindeUserId });
  }
}

async function latestOffboardEventLatency(
  kindeUserId: string,
): Promise<number | undefined> {
  const rows = await convex().query(api.audit.recent, { limit: 20 });
  const row = rows.find(
    (candidate) => candidate.kind === "offboard_event" && candidate.userId === kindeUserId,
  );
  return row?.webhookLatencyMs;
}

type PhaseResult = {
  mode: EnforcementMode;
  outcome: RunOutcome;
  actionsAfterOffboarding: { naive: number; enforced: number };
  webhookLatencyMs: number | undefined;
};

async function runPhase(kindeUserId: string, mode: EnforcementMode): Promise<PhaseResult> {
  console.log(`\n--- ${mode} mode ---`);
  process.env.ENFORCEMENT_MODE = mode;

  await restoreKindeUser(kindeUserId);
  await ensureUserActive(kindeUserId);
  await convex().mutation(api.resources.seedForOwner, { ownerUserId: kindeUserId });

  const { runId, correlationId } = await startAgentRun({ kindeUserId, task: TASK });
  console.log(`run ${runId} (correlationId ${correlationId})`);

  const runPromise = continueAgentRun({
    runId,
    correlationId,
    kindeUserId,
    task: TASK,
    stepDelayMs: 1500,
  });

  await waitUntil(
    async () => (await convex().query(api.runs.timeline, { runId })).length >= 1,
    15000,
    "the run's first step to be recorded",
  );

  const suspendedAt = Date.now();
  await suspendKindeUser(kindeUserId);
  console.log("suspended the test user in Kinde — waiting for the webhook");

  await waitUntil(
    async () =>
      (await convex().query(api.users.getByKindeUserId, { kindeUserId }))?.status ===
      "offboarded",
    10000,
    "Convex to see the user as offboarded (is the dev server up with the webhook tunnel reachable?)",
  );
  console.log(`Convex saw the offboarding ${Date.now() - suspendedAt}ms after the suspend call`);

  const outcome = await runPromise;
  const actionsAfterOffboarding = await convex().query(api.audit.actionsAfterOffboarding, {});
  const webhookLatencyMs = await latestOffboardEventLatency(kindeUserId);

  await restoreKindeUser(kindeUserId);
  await convex().mutation(api.users.reactivate, { kindeUserId });

  return { mode, outcome, actionsAfterOffboarding, webhookLatencyMs };
}

async function main(): Promise<void> {
  const kindeUserId = e2eKindeUserId();
  console.log("=== Phase 8 — e2e narrative ===");
  console.log(`test user: ${kindeUserId}`);
  console.log("requires npm run dev and npx convex dev already running, webhook reachable");

  const naive = await runPhase(kindeUserId, "naive");
  console.log(
    `naive: run ${naive.outcome.status}, ${naive.actionsAfterOffboarding.naive} allowed action(s) after offboarding`,
  );

  const enforced = await runPhase(kindeUserId, "enforced");
  const refusalNote =
    enforced.outcome.refusal !== undefined
      ? `, refused at step ${enforced.outcome.steps.length} (${enforced.outcome.refusal.reason})`
      : "";
  console.log(
    `enforced: run ${enforced.outcome.status}, ${enforced.actionsAfterOffboarding.enforced} allowed action(s) after offboarding${refusalNote}`,
  );

  const red = naive.actionsAfterOffboarding.naive > 0;
  const green =
    enforced.actionsAfterOffboarding.enforced === 0 &&
    enforced.outcome.status === "refused" &&
    enforced.outcome.refusal?.reason === "user_offboarded";

  console.log("\n=== result ===");
  console.log(
    red
      ? `RED proven — naive let ${naive.actionsAfterOffboarding.naive} action(s) through after the user was offboarded`
      : "RED not reproduced — naive mode let nothing through after offboarding (unexpected)",
  );
  console.log(
    green
      ? `GREEN proven — enforced stopped the run at step ${enforced.outcome.steps.length} (${enforced.outcome.refusal?.reason}), 0 actions allowed after offboarding`
      : "GREEN not proven — enforced mode allowed an action after offboarding, or did not refuse as expected",
  );
  if (enforced.webhookLatencyMs !== undefined) {
    console.log(`webhook latency (enforced run): ${enforced.webhookLatencyMs}ms`);
  }

  if (!red || !green) {
    console.log("\nFAIL");
    process.exitCode = 1;
    return;
  }
  console.log("\nPASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
