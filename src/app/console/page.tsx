"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type SessionInfo = {
  signedIn: boolean;
  kindeUserId?: string;
  accessTokenValid?: boolean;
  enforcementMode: "naive" | "enforced";
};

type RunHandle = {
  runId: Id<"runs">;
  correlationId: string;
};

const DEFAULT_TASK =
  "List my resources, then update the first one's body to add a line noting today's date.";

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-500/20 text-emerald-300"
      : status === "refused"
        ? "bg-amber-500/20 text-amber-300"
        : status === "errored"
          ? "bg-red-500/20 text-red-300"
          : "bg-neutral-500/20 text-neutral-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

export default function ConsolePage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [task, setTask] = useState(DEFAULT_TASK);
  const [stepDelayMs, setStepDelayMs] = useState(1500);
  const [run, setRun] = useState<RunHandle | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [offboardArmed, setOffboardArmed] = useState(false);
  const [offboardResult, setOffboardResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((info: SessionInfo) => {
        if (!cancelled) setSession(info);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!offboardArmed) return;
    const timer = setTimeout(() => setOffboardArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [offboardArmed]);

  const runDoc = useQuery(api.runs.get, run ? { runId: run.runId } : "skip");
  const timeline = useQuery(
    api.runs.timeline,
    run ? { runId: run.runId } : "skip",
  );
  const auditRows = useQuery(
    api.audit.byCorrelationId,
    run ? { correlationId: run.correlationId } : "skip",
  );

  const cutoffRow = auditRows?.find((row) => row.cutoffLatencyMs !== undefined);

  async function startRun() {
    setStarting(true);
    setStartError(null);
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task, stepDelayMs }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStartError(body.error ?? "run failed to start");
        return;
      }
      setRun({ runId: body.runId, correlationId: body.correlationId });
    } finally {
      setStarting(false);
    }
  }

  async function offboardSelf() {
    if (!offboardArmed) {
      setOffboardArmed(true);
      return;
    }
    setOffboardArmed(false);
    setOffboardResult(null);
    const response = await fetch("/api/admin/offboard", { method: "POST" });
    const body = await response.json();
    setOffboardResult(
      response.ok ? "Offboard request sent to Kinde." : (body.error ?? "offboard failed"),
    );
  }

  if (session === null) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
        Loading session…
      </main>
    );
  }

  if (!session.signedIn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Not signed in</h1>
        <a
          href="/api/auth/login"
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
        >
          Sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold">Offboarding Revocation Console</h1>
          <p className="text-xs text-neutral-500">{session.kindeUserId}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              session.enforcementMode === "enforced"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {session.enforcementMode === "enforced" ? "Enforced" : "Naive (hole open)"}
          </span>
          <span className="text-xs text-neutral-500">
            token valid: {session.accessTokenValid ? "yes" : "no"}
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-300">Run agent</h2>
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          rows={3}
          className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            Step delay (ms)
            <input
              type="number"
              min={0}
              value={stepDelayMs}
              onChange={(event) => setStepDelayMs(Number(event.target.value))}
              className="w-24 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1"
            />
          </label>
          <button
            onClick={() => void startRun()}
            disabled={starting}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Run agent"}
          </button>
        </div>
        {startError !== null && (
          <p className="text-sm text-red-400">{startError}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-300">Offboard control</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void offboardSelf()}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              offboardArmed
                ? "bg-red-500 text-white"
                : "border border-red-900 text-red-300"
            }`}
          >
            {offboardArmed ? "Click again to confirm" : "Offboard me"}
          </button>
          {offboardResult !== null && (
            <span className="text-xs text-neutral-400">{offboardResult}</span>
          )}
        </div>
      </section>

      {run !== null && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-neutral-300">Live timeline</h2>
            {runDoc !== undefined && runDoc !== null && (
              <StatusBadge status={runDoc.status} />
            )}
          </div>
          <p className="text-xs text-neutral-500">
            correlationId: {run.correlationId}
          </p>

          {runDoc?.status === "refused" && (
            <p className="text-sm text-amber-300">
              Refused before completion — the run stopped at the first refusal.
            </p>
          )}
          {runDoc?.status === "errored" && (
            <p className="text-sm text-red-400">{runDoc.error}</p>
          )}
          {runDoc?.status === "completed" && (
            <p className="text-sm text-neutral-300">Run completed.</p>
          )}

          <ol className="flex flex-col gap-2">
            {(timeline ?? []).map((event) => (
              <li
                key={event._id}
                className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
              >
                <span>
                  #{event.stepIndex} {event.action}
                </span>
                <span
                  className={
                    event.decision === "allow"
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }
                >
                  {event.decision} — {event.reason}
                </span>
              </li>
            ))}
            {(timeline ?? []).length === 0 && (
              <li className="text-xs text-neutral-500">
                Waiting for the first step…
              </li>
            )}
          </ol>

          {cutoffRow !== undefined && (
            <p className="text-sm text-neutral-300">
              Cutoff latency: {cutoffRow.cutoffLatencyMs} ms after offboarding
              was recorded.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
