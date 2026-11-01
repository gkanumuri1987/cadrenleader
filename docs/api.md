# API v1

All endpoints return JSON. Errors use `{ "error": "Human-readable message" }` with an appropriate 4xx/5xx status. Writes require `Content-Type: application/json`. Browser sessions use the HttpOnly `session` cookie. No CORS access is enabled. Native bearer authentication is future work.

| Method | Endpoint                       | Purpose                                                                                                    |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/config`               | Whether this is explicitly a demo environment                                                              |
| POST   | `/api/v1/login`                | `{email,password}`; demo-only `{demoRole: "member" or "leader"}`                                           |
| POST   | `/api/v1/logout`               | Revoke current session                                                                                     |
| GET    | `/api/v1/state`                | Authenticated user, active unit, scoped events/tasks/posts/people, own and authorized review contributions |
| POST   | `/api/v1/invitations`          | Leader creates `{unit}` invitation; returns token and expiration                                           |
| GET    | `/api/v1/invitation?token=…`   | Public preview of the exact invited team; no private team content                                          |
| POST   | `/api/v1/accept-invitation`    | `{token,name,email,password,consent:true}`; new account, membership and session                            |
| POST   | `/api/v1/join`                 | `{unit}` requests membership within a previously associated organization                                   |
| GET    | `/api/v1/requests?unit=…`      | Leader's pending membership requests                                                                       |
| POST   | `/api/v1/membership/approve`   | Leader approves `{unit,user}`                                                                              |
| POST   | `/api/v1/leave`                | Voluntary immediate exit `{unit}`; appointments revoked and RSVPs withdrawn                                |
| POST   | `/api/v1/profile`              | `{visibility:"private" or "unit"}`                                                                         |
| GET    | `/api/v1/journey?user=…`       | Own journey, or explicitly unit-shared verified records within a current shared unit                       |
| POST   | `/api/v1/posts`                | `{unit,body,official:boolean}`; official identity requires appointment                                     |
| POST   | `/api/v1/events`               | Leader: `{unit,title,description,venue,date,capacity,requiresPermit:boolean}`                              |
| POST   | `/api/v1/events/:id/rsvp`      | `{going:boolean}`; capacity-checked, repeat-safe                                                           |
| POST   | `/api/v1/events/:id/status`    | Leader: `{status}`; published → ready → active → completed → closed; cancellation during planning/active   |
| POST   | `/api/v1/tasks`                | Leader: `{unit,assignee,event?,title,due}`                                                                 |
| POST   | `/api/v1/contributions`        | Assignee: `{task,summary}`; one logical contribution per task; returned work can be revised                |
| POST   | `/api/v1/contributions/review` | Other leader: `{id,status:"verified" or "returned",note}`                                                  |

Event dates use ISO 8601 timestamps with an explicit UTC offset. The browser converts local date/time input to UTC and renders stored times in the viewer’s timezone. A venue-specific timezone selector is future work; cross-region organizers must confirm the intended local time. Date-only task deadlines are interpreted as calendar dates. Responses currently have bounded pilot scope rather than pagination; add pagination before large deployments.

## Version 0.2 additions

| Method | Endpoint                        | Purpose                                                                                                                                                                                                                                           |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/events/:id`            | Scoped workspace with outcome, own attendance and aggregate counts. Appointed leaders additionally receive attendee names, permission evidence and the event activity log.                                                                        |
| POST   | `/api/v1/events/:id/attendance` | Leader records/corrects `{user,present:boolean}` for an active RSVP while the event is active or completed. Locked after closure.                                                                                                                 |
| POST   | `/api/v1/events/:id/permit`     | Leader records `{status:"approved" or "rejected",issuer,reference,validUntil,conditions,confirmed:true}` before start. Approval requires validity through the event date/current time. Re-review resets readiness and retains the prior decision. |
| POST   | `/api/v1/events/:id/outcome`    | Leader saves `{summary,followUp}` after completion. Both are required before closure.                                                                                                                                                             |
| POST   | `/api/v1/tasks/:id/progress`    | Assignee updates `{status:"open" or "in_progress" or "blocked",note}` before submission.                                                                                                                                                          |

Cancellation now requires `{status:"cancelled",reason}` and creates an official team update. RSVP changes are closed for cancelled/completed/closed events; checked-in attendees require an organizer correction before withdrawing. Cancelled/closed events cannot receive new task assignments. Clients must send actual JSON booleans, and write bodies must be objects. Calendar dates are validated rather than silently normalized.
