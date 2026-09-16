import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Five minutes is fast enough that a missed webhook is caught well inside a
 * work session, and light enough not to matter at this demo's user count.
 * A real deployment would tune this against its own webhook reliability
 * numbers rather than inherit this value unexamined.
 */
crons.interval(
  "kinde offboarding reconciliation sweep",
  { minutes: 5 },
  internal.reconciliation.sweep,
);

export default crons;
