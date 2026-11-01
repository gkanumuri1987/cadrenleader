# Cadre & Leader

A responsive web application for voluntary community participation. Members join a private team, RSVP to events, complete assigned work, submit a contribution, and retain a personal journey. Appointed leaders coordinate work and independently review contributions.

**Version 0.2 — coordination workspace. Status: working pilot foundation, not cleared for sensitive production data.** This implements the first vertical slice of the Leadership and Cadre Platform Plan. It does not implement the full ten-page roadmap or claim security certification.

## Run locally

Requires Node.js 22.13 or newer (Node 24 LTS recommended). No third-party runtime packages are needed.

```sh
npm run dev
```

Open http://127.0.0.1:3100 and choose **Explore as a member** or **Open leader workspace**. Demo mode uses synthetic people and sample events. It permits anyone with access to sign in as the demo member or leader. Keep it local and never put real data in a demo database.

Data persists in `data/app.sqlite`. Use a different `DATABASE_PATH` for a fresh demo. Demo data is seeded only into an empty database. `npm start` disables demo sign-in unless `DEMO_MODE=1` is explicitly set.

## Try the complete workflow

1. Open the leader workspace → My community → Invite a member. Copy the single-use link into a separate browser session. Preview the team and voluntarily create an account to join. Invitations expire after 72 hours and stop working if the creator loses their appointment.
2. Leader: create an event and assign a task to the new member.
3. Member: RSVP, open My work, describe the completed work and submit it.
4. Leader: open Review queue, verify the work with a reason or return it for clarification. Self-verification is blocked.
5. Member: open My journey. Choose private or team visibility. Leaving the team immediately ends new private access while retaining personal contributions.

For a shorter demo, use the preassigned welcome-desk task with the built-in member and leader accounts. Sign out using the avatar in the top bar to switch accounts.

## Implemented

- Password authentication using salted scrypt; hashed, expiring server sessions; HttpOnly/SameSite cookies; logout; login attempt limits.
- Single-use invitation onboarding, explicit voluntary joining, membership requests for rejoining, leader approval, and voluntary exit.
- Server-enforced membership scope and separate leader appointments. Billing cannot create authority.
- Searchable event directory and dedicated event workspaces with capacity-limited RSVP, organizer attendance and corrections, permission evidence reviews, expiry checks, outcomes, closure gates, cancellation announcements, and activity history.
- Searchable task lists and boards, assignee progress updates, blocker notes, overdue filters, contribution submission, independent review, and corrections with the original reviewer explanation preserved.
- Personal journey and consent-based sharing of verified records within the active team. Private is the default.
- Member and official team text posts with server checks for official identity.
- Responsive keyboard-accessible interface, native form validation, accessible dialogs, error messages, and an app manifest. The manifest supports standalone presentation on compatible browsers; offline use and native apps are not implemented.
- SQLite persistence, versioned HTTP API, automated integration tests, Docker packaging, and GitHub Actions checks.

## Architecture and mobile direction

The browser uses same-origin JSON endpoints under `/api/v1/`. Node's HTTP server serves the frontend; SQLite stores durable transactional records. No application records are stored in browser local storage. All authorization is evaluated on the server.

Future iOS/Android clients can reuse the workflow API, but need a dedicated mobile authentication adapter (OAuth/OIDC with PKCE and secure device credential storage), not copied browser cookies. Consider React Native/Expo after pilot usability validation. The web interface has no dependency on a mobile framework. Move to a managed relational database before horizontal multi-instance deployment; SQLite here is for a single application instance with a persistent volume.

See [architecture and release scope](docs/architecture.md) and [API reference](docs/api.md).

## Non-demo bootstrap

Start with a fresh database and provide these environment variables through your deployment secret manager:

- `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, `BOOTSTRAP_PASSWORD` (at least 14 characters)
- `ORGANIZATION_NAME`
- `DATABASE_PATH` (persistent volume path)
- `PORT` (default `3100`), `HOST` (default `127.0.0.1`)
- `SECURE_COOKIE=1` behind a correctly configured HTTPS reverse proxy

The bootstrap creates one organization/unit and its initial appointed administrator only when the database is empty. Remove bootstrap secrets after initial setup. Never reuse the demo database for production. The reverse proxy must preserve the external Host and terminate TLS; the app validates browser Origin against that host. No proxy trust is inferred from arbitrary forwarded headers.

## Validation

```sh
npm run check
npm test
```

Tests include browser-form payload regressions and use isolated in-memory databases and exercise authorization and complete HTTP workflows, including revoked access, invitations, duplicate submissions, permit blocking, privacy boundaries, cross-origin writes and logout. These tests are not a penetration test. Version 0.2 was also checked in the browser for task progress, contribution submission, organizer attendance and event outcomes. See [review and changes](docs/review-0.2.md).

## Required before a real pilot

- Managed identity/contact verification, passkeys or MFA for leaders, recovery, invitation controls and abuse prevention.
- Validated Telugu translations, language preference controls, and native-speaker usability review. This release is English only.
- Organization administration, deep hierarchy and transfer/appointment workflows, handover, removal appeals, moderation and reporting.
- Private media processing/storage, safe upload recovery and evidence attachments. Permission review currently records manually inspected evidence references; it does not contact an issuing authority.
- Data retention/deletion/export policy and workflows, consent/privacy notice reviewed for the launch jurisdiction, independent authorization/security review, encrypted backups and a proven restore process.
- HTTPS hosting, monitoring, distributed rate limiting, pagination, load/accessibility testing and deployment operations.

Subscriptions, payments, ratings, promotions, government integrations, GPS tracking, voter profiling, political persuasion targeting and native mobile applications are not part of this implementation.
