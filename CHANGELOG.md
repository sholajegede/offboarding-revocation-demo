# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-09-16

### Added
- Kinde sign-in with encrypted session cookies and JWKS-based access token verification.
- A closed action registry (`list_resources`, `read_resource`, `write_resource`) shared by the agent's tool schema and the enforcement seam.
- The enforcement seam, `enforceToolCall`, with naive and enforced modes, resolved server-side and never from the browser.
- A Claude-driven multi-step agent loop, with every tool call passing through the seam under one correlation id.
- A Kinde webhook receiver for offboarding events, with signature verification, timestamp freshness checks, and idempotent delivery handling.
- A reconciliation sweep, on a 5-minute cron, as a backstop for a missed or delayed webhook.
- An operator console: sign in, run the agent, offboard the signed-in user, and watch the run's timeline live.
- `scripts/e2e-narrative.ts`, an end-to-end script proving naive and enforced behavior against real infrastructure in one run.
