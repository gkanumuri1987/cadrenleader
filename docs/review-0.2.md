# Application review and upgrade — 0.2

Review baseline: `d450487` on `codex/web-mvp`. This review covered the browser application, outgoing form payloads, HTTP authorization and event/task workflows. No independent security audit or production load assessment is claimed.

## Findings addressed

1. **P1 — unrelated event-date conversion broke other browser forms.** The submit handler eagerly constructed every route payload, including `new Date(values.date).toISOString()`. A contribution, review, task, post or profile form had no event date and could fail before its request was sent. Payload construction now selects only the submitted form, with a regression test that throws if unrelated date fields are evaluated. Contribution and new task-progress/outcome forms were exercised in the browser.
2. **P1 — permit approval had no validity model and no usable review path.** The earlier readiness guard accepted the status string `approved` with no verified evidence/expiry record. The organizer can now record issuer, reference, conditions, expiration and an explicit review confirmation. Ready/start transitions independently check the current decision and validity. Re-review resets readiness and preserves the previous decision.
3. **P2 — event closure did not record what happened.** Added organizer attendance and corrections, outcome/follow-up records, a closure gate, and scoped activity history. Attendance rosters and evidence remain leader-only; members can see their own attendance and aggregate counts.
4. **P2 — terminal events still advertised RSVP actions; cancellation had no visible explanation.** Terminal-event cards now open their workspace. Cancellation requires a reason and posts a team announcement. New assignments to cancelled/closed events are rejected.
5. **P2 — work offered no way to communicate progress or a blocker.** Added progress states, contextual notes, overdue filtering, search, and list/board views. Returned contributions show the review explanation and retain the previous summary for revision. Submitted/verified work cannot be reset through progress updates.
6. **P2 — malformed payloads produced generic server errors or ambiguous actions.** Writes reject non-object bodies and missing identifiers; RSVP/attendance/identity controls require actual booleans; impossible task dates are rejected. Invitation acceptance has a bounded rate limit and expired login sessions are cleaned up.

## User experience changes

A dedicated event workspace brings lifecycle, attendance, tasks and outcomes together. The home screen prioritizes overdue tasks, blockers and pending reviews. Event and task search is scoped to data the server already authorizes. Small-screen controls and text are larger, event cards stack cleanly, and board columns can be scrolled horizontally. Team initials now reflect the current team. Event links can be opened directly; unavailable records return to the event directory.

## Verification

- Sixteen automated tests passed, including the original eight workflows and new form, permit, attendance, cancellation, task-progress and validation checks.
- Browser checks: member blocker update and contribution submission; leader contribution review, event readiness/start, attendance confirmation, event completion, outcome save and closure enablement; task search and board mode. A 390-pixel viewport was visually inspected, with no horizontal page overflow.
- Local synthetic preview data was kept in a separate ignored database, preserving the existing demo database.

## Remaining release work

Managed identity/contact verification, MFA/recovery, media uploads, Telugu localization, organization hierarchy and succession, moderation, notifications outside the app, retention/export/deletion operations, backup/restore validation and production deployment remain open. The last active leader can still leave voluntarily; succession administration needs a dedicated workflow before a real pilot. Do not represent this release as a complete implementation of the product plan or as production-certified security.
