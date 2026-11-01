/** Event operations share the same authorization boundary as the core API. */
export function eventWorkflows({
  get,
  all,
  run,
  transaction,
  scope,
  lead,
  member,
  audit,
  assert,
  text,
  id,
  now,
}) {
  const activeRSVP = (e) => ["published", "ready", "active"].includes(e.status);
  function permitValid(e) {
    if (e.permit === "not_required") return true;
    const p = get("SELECT * FROM event_permits WHERE event=?", e.id);
    return (
      e.permit === "approved" &&
      p?.status === "approved" &&
      Date.parse(p.valid_until) >= Math.max(Date.now(), Date.parse(e.date))
    );
  }
  return async ({ path, method, body, uid, send }) => {
    const match = path.match(
      /^\/api\/v1\/events\/([a-z0-9-]+)(?:\/(rsvp|status|attendance|permit|outcome))?$/,
    );
    if (!match) return false;
    const [, eid, action] = match;
    const e = get("SELECT * FROM events WHERE id=?", eid);
    assert(e, 404, "Event unavailable");
    scope(uid, e.unit);
    if (!action && method === "GET") {
      const isLeader = !!get(
        "SELECT user FROM appointments WHERE user=? AND unit=? AND active=1",
        uid,
        e.unit,
      );
      const attendance = get(
        "SELECT present FROM attendance WHERE event=? AND user=?",
        eid,
        uid,
      );
      const outcome =
        get(
          "SELECT summary,follow_up,updated FROM event_outcomes WHERE event=?",
          eid,
        ) || null;
      const permit =
        get("SELECT * FROM event_permits WHERE event=?", eid) || null;
      send(200, {
        event: {
          ...e,
          attending: get("SELECT count(*) n FROM rsvps WHERE event=?", eid).n,
          going: !!get(
            "SELECT user FROM rsvps WHERE event=? AND user=?",
            eid,
            uid,
          ),
        },
        cancellation:
          get(
            "SELECT reason,created FROM event_cancellations WHERE event=?",
            eid,
          ) || null,
        permitValid: !!permitValid(e),
        permit: isLeader ? permit : null,
        outcome,
        myAttendance: attendance ? !!attendance.present : null,
        attendees: isLeader
          ? all(
              "SELECT u.id,u.name,coalesce(a.present,0) present,a.updated FROM rsvps r JOIN users u ON u.id=r.user JOIN memberships m ON m.user=u.id AND m.unit=? AND m.status='active' LEFT JOIN attendance a ON a.event=r.event AND a.user=u.id WHERE r.event=? ORDER BY u.name",
              e.unit,
              eid,
            )
          : [],
        attendanceCount: get(
          "SELECT count(*) n FROM attendance WHERE event=? AND present=1",
          eid,
        ).n,
        tasks: all(
          "SELECT t.*,u.name assigneeName FROM tasks t JOIN users u ON u.id=t.assignee WHERE event=? AND (?=1 OR assignee=?) ORDER BY due",
          eid,
          isLeader ? 1 : 0,
          uid,
        ),
        history: isLeader
          ? all(
              "SELECT a.action,a.created,u.name actorName FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE a.object=? AND a.action LIKE 'event.%' ORDER BY a.created DESC LIMIT 30",
              eid,
            )
          : [],
      });
      return true;
    }
    assert(method === "POST" && action, 405, "Method not allowed");
    if (action === "rsvp") {
      assert(
        typeof body.going === "boolean",
        400,
        "RSVP must be true or false",
      );
      transaction(() => {
        assert(
          activeRSVP(e),
          409,
          "This event is no longer accepting RSVP changes",
        );
        if (body.going) {
          assert(
            get("SELECT user FROM rsvps WHERE event=? AND user=?", eid, uid) ||
              get("SELECT count(*) n FROM rsvps WHERE event=?", eid).n <
                e.capacity,
            409,
            "This event is full",
          );
          run("INSERT OR IGNORE INTO rsvps VALUES(?,?)", eid, uid);
        } else {
          assert(
            !get(
              "SELECT user FROM attendance WHERE event=? AND user=? AND present=1",
              eid,
              uid,
            ),
            409,
            "Ask the organizer to correct your attendance before withdrawing",
          );
          run("DELETE FROM rsvps WHERE event=? AND user=?", eid, uid);
        }
      });
    } else {
      lead(uid, e.unit);
      if (action === "attendance") {
        assert(
          ["active", "completed"].includes(e.status),
          409,
          "Record attendance while the event is active or completed",
        );
        assert(
          typeof body.present === "boolean",
          400,
          "Attendance must be true or false",
        );
        text(body.user, "Attendee", 128);
        assert(
          member(body.user, e.unit) &&
            get(
              "SELECT user FROM rsvps WHERE event=? AND user=?",
              eid,
              body.user,
            ),
          404,
          "Attendee unavailable",
        );
        transaction(() => {
          run(
            "INSERT INTO attendance VALUES(?,?,?,?,?) ON CONFLICT(event,user) DO UPDATE SET present=excluded.present,recorder=excluded.recorder,updated=excluded.updated",
            eid,
            body.user,
            body.present ? 1 : 0,
            uid,
            now(),
          );
          audit(
            uid,
            body.present
              ? "event.attendance_confirmed"
              : "event.attendance_corrected",
            eid,
          );
        });
      }
      if (action === "permit") {
        assert(
          ["published", "ready"].includes(e.status),
          409,
          "Permit decisions can be changed before the event starts",
        );
        assert(
          e.permit !== "not_required",
          409,
          "This event does not require a permit",
        );
        assert(
          ["approved", "rejected"].includes(body.status),
          400,
          "Choose a permit decision",
        );
        const issuer = text(body.issuer, "Issuing authority", 160),
          reference = text(body.reference, "Permit reference", 160),
          conditions = text(body.conditions, "Conditions or review note", 2000);
        assert(
          body.confirmed === true,
          400,
          "Confirm that you inspected the permission evidence",
        );
        if (body.status === "approved")
          assert(
            typeof body.validUntil === "string" &&
              /(Z|[+-]\d{2}:\d{2})$/.test(body.validUntil) &&
              Number.isFinite(Date.parse(body.validUntil)),
            400,
            "Choose a valid expiration with a timezone",
          );
        const expires =
          body.status === "approved"
            ? new Date(body.validUntil).toISOString()
            : "";
        assert(
          body.status !== "approved" ||
            Date.parse(expires) >= Math.max(Date.now(), Date.parse(e.date)),
          400,
          "Permission must remain valid through the event date",
        );
        transaction(() => {
          const previous = get(
            "SELECT * FROM event_permits WHERE event=?",
            eid,
          );
          if (previous)
            run(
              "INSERT INTO event_permit_revisions VALUES(?,?,?,?,?)",
              id(),
              eid,
              JSON.stringify(previous),
              uid,
              now(),
            );
          run(
            "INSERT INTO event_permits VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event) DO UPDATE SET status=excluded.status,issuer=excluded.issuer,reference=excluded.reference,valid_until=excluded.valid_until,conditions=excluded.conditions,reviewer=excluded.reviewer,reviewed=excluded.reviewed",
            eid,
            body.status,
            issuer,
            reference,
            expires,
            conditions,
            uid,
            now(),
          );
          // A changed decision requires the organizer to deliberately re-confirm readiness.
          run(
            "UPDATE events SET permit=?,status='published' WHERE id=?",
            body.status,
            eid,
          );
          audit(uid, "event.permit_" + body.status, eid);
        });
      }
      if (action === "outcome") {
        assert(
          e.status === "completed",
          409,
          "Record the outcome after completing the event",
        );
        const summary = text(body.summary, "Outcome summary", 4000),
          followUp = text(body.followUp, "Follow-up plan", 2000);
        transaction(() => {
          run(
            "INSERT INTO event_outcomes VALUES(?,?,?,?,?) ON CONFLICT(event) DO UPDATE SET summary=excluded.summary,follow_up=excluded.follow_up,author=excluded.author,updated=excluded.updated",
            eid,
            summary,
            followUp,
            uid,
            now(),
          );
          audit(uid, "event.outcome_saved", eid);
        });
      }
      if (action === "status") {
        const transitions = {
          published: ["ready", "cancelled"],
          ready: ["active", "cancelled"],
          active: ["completed", "cancelled"],
          completed: ["closed"],
        };
        assert(
          transitions[e.status]?.includes(body.status),
          409,
          "Invalid event transition",
        );
        if (["ready", "active"].includes(body.status))
          assert(
            permitValid(e),
            409,
            "A verified permit valid through the event is required",
          );
        if (body.status === "closed")
          assert(
            get("SELECT event FROM event_outcomes WHERE event=?", eid),
            409,
            "Record the outcome and follow-up plan before closing",
          );
        const reason =
          body.status === "cancelled"
            ? text(body.reason, "Cancellation reason", 1000)
            : "";
        transaction(() => {
          run("UPDATE events SET status=? WHERE id=?", body.status, eid);
          if (body.status === "cancelled") {
            run(
              "INSERT INTO event_cancellations VALUES(?,?,?,?)",
              eid,
              reason,
              uid,
              now(),
            );
            // Preserve historical responses but close expectations; clients display cancellation explicitly.
            run(
              "INSERT INTO posts VALUES(?,?,?,?,?,?)",
              id(),
              e.unit,
              uid,
              `${e.title} has been cancelled. ${reason}`,
              1,
              now(),
            );
          }
          audit(uid, "event." + body.status, eid);
        });
      }
    }
    send(200, { ok: true });
    return true;
  };
}
