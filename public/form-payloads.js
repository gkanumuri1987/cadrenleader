/** Build only the submitted form's payload. Keep unrelated fields unevaluated. */
export function formPayload(type, values, { unit, selectedId, eventId } = {}) {
  const timestamp = (value) => {
    if (!value || !Number.isFinite(Date.parse(value)))
      throw new Error("Choose a valid date and time.");
    return new Date(value).toISOString();
  };
  switch (type) {
    case "submit":
      return ["contributions", { task: selectedId, summary: values.summary }];
    case "review":
      return [
        "contributions/review",
        { id: selectedId, status: values.status, note: values.note },
      ];
    case "create-event":
      return [
        "events",
        {
          unit,
          title: values.title,
          description: values.description,
          venue: values.venue,
          date: timestamp(values.date),
          capacity: Number(values.capacity),
          requiresPermit: values.requiresPermit === "on",
        },
      ];
    case "create-task":
      return [
        "tasks",
        {
          unit,
          title: values.title,
          assignee: values.assignee,
          event: values.event || null,
          due: values.due,
        },
      ];
    case "create-post":
      return [
        "posts",
        { unit, body: values.body, official: values.official === "true" },
      ];
    case "profile":
      return ["profile", { visibility: values.visibility }];
    case "leave":
      return ["leave", { unit }];
    case "task-progress":
      return [
        `tasks/${selectedId}/progress`,
        { status: values.status, note: values.note },
      ];
    case "permit":
      return [
        `events/${eventId}/permit`,
        {
          status: values.status,
          issuer: values.issuer,
          reference: values.reference,
          validUntil:
            values.status === "approved" ? timestamp(values.validUntil) : null,
          conditions: values.conditions,
          confirmed: values.confirmed === "on",
        },
      ];
    case "outcome":
      return [
        `events/${eventId}/outcome`,
        { summary: values.summary, followUp: values.followUp },
      ];
    case "cancel-event":
      return [
        `events/${eventId}/status`,
        { status: "cancelled", reason: values.reason },
      ];
    default:
      throw new Error("This form is unavailable. Refresh and try again.");
  }
}
