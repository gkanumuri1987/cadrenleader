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
