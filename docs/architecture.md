# Architecture and release scope

This repository is a new application, separate from Taabel. The supplied platform plan is a product baseline; its proposed schedules, security thresholds and commercial features are not implemented guarantees.

## Boundaries

- Identity: users, hashed credentials, sessions and single-use invitations.
- Organization: units, memberships and appointments are separate records. Current workflows expose one active primary team. Multi-level administration and delegated subtree permissions are deferred.
- Coordination: event, RSVP and task records; transactional capacity changes and ordered state transitions.
- Recognition: contribution per task, independent review, revision snapshots and append-only audit events. No universal score or automated promotion.
- Community: private team text posts, explicitly selected official identity, private journey by default.

The single-process server uses bound SQL parameters and synchronous short database transactions. No private media or payment system is integrated. A modular service split can follow real scaling needs; the current code deliberately remains a small deployable slice.

## Security properties and limits

Every team-scoped API checks active membership; leader mutations additionally require a current appointment. Missing scope yields a generic unavailable response. Sessions store a SHA-256 digest of a random token and expire after seven days. Passwords use a random salt and scrypt. Authentication attempts are rate-limited in process. JSON writes reject foreign browser origins; cookies are HttpOnly and SameSite Strict, with Secure enabled for HTTPS hosting. Static resources use a restrictive CSP, and user content is escaped before HTML rendering.

This is not sufficient for production political membership data. Contact ownership is not verified, leader MFA is absent, rate limiting is not distributed, logs/audit retention are not operationalized, and no independent security audit or backup restore drill has been performed. Demo sign-in deliberately bypasses credentials for two synthetic accounts and must never be enabled on a real data deployment.

Journey sharing shows only verified contributions for the currently shared unit. Team exit ends that unit's future access to the member's shared journey. Personal history remains accessible to its owner; retention/deletion rules must be established before real use. Revocation cannot recall already viewed or downloaded information.

Pending permit events remain preliminary. Appointed organizers record manually inspected evidence with an issuer, reference, validity and conditions. Readiness and starting the event both require a recorded approval valid through the event date and current time. Re-review resets readiness, and prior permit decisions are retained. This is internal evidence tracking, not an authority integration or a guarantee of permission. Media/document attachments are not yet implemented.

The event workflow module owns detailed event views, attendance, permission review, outcomes and lifecycle changes. Attendance rosters and evidence references are restricted to appointed team leaders; members see aggregate attendance and their own status. Completed events require an outcome and follow-up plan before closure. Cancellation publishes an official team-board notice. Notifications outside the app are not integrated.

Schema upgrades add tables and indexes on startup without rebuilding existing user data. Existing events are preserved; any legacy approved permit without recorded validity must be reviewed before readiness/start. Frontend form payloads are built in a separately tested module so unrelated form fields are never evaluated.

## Deployment

Use one Node instance with a persistent SQLite volume. The Docker image runs as the unprivileged node user and listens on port 3100. Terminate HTTPS at a reverse proxy, enable secure cookies and restrict demo environments. Do not use ephemeral filesystem hosting or start several independent instances against copied databases.

Future native apps should share API contracts and server policies. Add an OIDC/PKCE adapter, a mobile-specific session/revocation design, typed client SDK and API compatibility tests before shipping mobile clients. A manifest alone does not make this a complete PWA or native app.
