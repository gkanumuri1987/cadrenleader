import { test } from "node:test";
import assert from "node:assert/strict";
import { formPayload } from "../public/form-payloads.js";
const context = { unit: "team", selectedId: "item", eventId: "gathering" };
test("non-event forms never evaluate an unrelated date field", () => {
  const values = {
    summary: "Completed welcome desk",
    status: "verified",
    note: "Confirmed",
    body: "Team update",
    visibility: "private",
    title: "Task",
    assignee: "member",
    due: "2030-01-02",
  };
  Object.defineProperty(values, "date", {
    get() {
      throw new Error("Unrelated event date evaluated");
    },
  });
  for (const type of [
    "submit",
    "review",
    "create-post",
    "profile",
    "leave",
    "create-task",
    "task-progress",
    "outcome",
    "cancel-event",
  ])
    assert.ok(formPayload(type, values, context));
  assert.deepEqual(formPayload("submit", values, context), [
    "contributions",
    { task: "item", summary: values.summary },
  ]);
  assert.deepEqual(formPayload("review", values, context), [
    "contributions/review",
    { id: "item", status: "verified", note: "Confirmed" },
  ]);
});
test("event and permit forms validate dates and convert native form values", () => {
  const [, body] = formPayload(
    "create-event",
    {
      title: "Park event",
      description: "A community gathering",
      venue: "Park",
      date: "2030-01-01T10:00",
      capacity: "60",
      requiresPermit: "on",
    },
    context,
  );
  assert.equal(body.capacity, 60);
  assert.equal(body.requiresPermit, true);
  assert.match(body.date, /Z$/);
  assert.throws(
    () => formPayload("create-event", { date: "" }, context),
    /valid date/,
  );
  assert.throws(
    () =>
      formPayload(
        "permit",
        { status: "approved", validUntil: "invalid" },
        context,
      ),
    /valid date/,
  );
  assert.equal(
    formPayload(
      "permit",
      {
        status: "approved",
        issuer: "Council",
        reference: "123",
        validUntil: "2030-01-01T10:00",
        conditions: "Daytime",
        confirmed: "on",
      },
      context,
    )[1].confirmed,
    true,
  );
});

test("a rejected permission decision does not require an invented expiration", () => {
  assert.equal(
    formPayload(
      "permit",
      {
        status: "rejected",
        issuer: "Council",
        reference: "Refused",
        conditions: "Location not approved",
        confirmed: "on",
      },
      context,
    )[1].validUntil,
    null,
  );
});
