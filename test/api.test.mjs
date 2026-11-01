import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApp } from "../server.mjs";
async function fixture(t) {
  const { server, db } = createApp({ database: ":memory:", demo: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, cookie, headers = {}) => {
    const r = await fetch(origin + "/api/v1/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const member = (await request("login", { demoRole: "member" })).cookie,
    leader = (await request("login", { demoRole: "leader" })).cookie;
  const otherToken = "test-other-token";
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    createHash("sha256").update(otherToken).digest("hex"),
    "other",
    Date.now() + 60000,
  );
  return { request, db, member, leader, other: "session=" + otherToken };
}
test("member → RSVP → task submission → independent review → persistent journey", async (t) => {
  const { request, member, leader } = await fixture(t);
  assert.equal((await request("state")).status, 401);
  assert.equal(
    (await request("events/clean-drive/rsvp", { going: true }, member)).status,
    200,
  );
  assert.equal(
    (await request("events/clean-drive/rsvp", { going: true }, member)).status,
    200,
  );
  let s = (await request("state", null, member)).data;
  assert.equal(s.events[0].attending, 1);
  assert.equal(
    (
      await request(
        "contributions",
        {
          task: "welcome",
          summary:
            "Welcomed 30 volunteers and prepared accessible sign-in materials.",
        },
        member,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        "contributions",
        { task: "welcome", summary: "Duplicate" },
        member,
      )
    ).status,
    409,
  );
  s = (await request("state", null, leader)).data;
  const c = s.contributions.find((c) => c.task === "welcome");
  assert.ok(c);
  assert.equal(
    (
      await request(
        "contributions/review",
        {
          id: c.id,
          status: "verified",
          note: "Confirmed the welcome desk was ready and accessible.",
        },
        member,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "contributions/review",
        {
          id: c.id,
          status: "verified",
          note: "Confirmed the welcome desk was ready and accessible.",
        },
        leader,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "contributions/review",
        { id: c.id, status: "verified", note: "Again" },
        leader,
      )
    ).status,
    409,
  );
  s = (await request("state", null, member)).data;
  assert.equal(
    s.contributions.find((item) => item.id === c.id).status,
    "verified",
  );
  assert.equal(s.tasks.find((t) => t.id === "welcome").status, "verified");
});
test("cross-organization access, official identity, and own-work verification are denied", async (t) => {
  const { request, member, leader, other } = await fixture(t);
  assert.equal(
    (await request("events/clean-drive/rsvp", { going: true }, other)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "posts",
        { unit: "vijayawada", body: "Impersonation", official: true },
        member,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "tasks",
        {
          unit: "guntur",
          assignee: "other",
          title: "Cross tenant",
          due: "2030-01-01",
        },
        leader,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "contributions",
        { task: "supplies", summary: "Confirmed accessible supplies." },
        leader,
      )
    ).status,
    201,
  );
  const s = (await request("state", null, leader)).data;
  const c = s.contributions.find((c) => c.task === "supplies");
  assert.equal(
    (
      await request(
        "contributions/review",
        { id: c.id, status: "verified", note: "Self review" },
        leader,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "contributions/review",
        { id: c.id, status: "verified", note: "Cross org" },
        other,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request("state", null, other)).data.contributions.length,
    0,
  );
});
test("leave revokes private requests immediately, keeps journey, and rejoin needs approval", async (t) => {
  const { request, member, leader } = await fixture(t);
  assert.equal(
    (await request("leave", { unit: "vijayawada" }, member)).status,
    200,
  );
  const s = (await request("state", null, member)).data;
  assert.equal(s.units.length, 0);
  assert.equal(s.events.length, 0);
  assert.equal(s.people.length, 0);
  assert.equal(s.posts.length, 0);
  assert.equal(s.contributions.length, 1);
  assert.equal(
    (await request("events/clean-drive/rsvp", { going: true }, member)).status,
    404,
  );
  assert.equal((await request("join", { unit: "guntur" }, member)).status, 403);
  assert.equal(
    (await request("join", { unit: "vijayawada" }, member)).status,
    200,
  );
  assert.equal((await request("state", null, member)).data.units.length, 0);
  assert.equal(
    (
      await request(
        "membership/approve",
        { unit: "vijayawada", user: "member" },
        leader,
      )
    ).status,
    200,
  );
  assert.equal((await request("state", null, member)).data.units.length, 1);
});
test("event workflow validates state and blocks missing permits", async (t) => {
  const { request, leader } = await fixture(t);
  const created = await request(
    "events",
    {
      unit: "vijayawada",
      title: "Permit event",
      description: "An event with an external permission requirement",
      venue: "Town square",
      date: "2035-01-01T12:00:00.000Z",
      capacity: 10,
      requiresPermit: true,
    },
    leader,
  );
  assert.equal(created.status, 201);
  assert.equal(
    (
      await request(
        `events/${created.data.id}/status`,
        { status: "ready" },
        leader,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "events/clean-drive/status",
        { status: "completed" },
        leader,
      )
    ).status,
    409,
  );
  for (const status of ["ready", "active", "completed", "closed"])
    assert.equal(
      (await request("events/clean-drive/status", { status }, leader)).status,
      200,
    );
  assert.equal(
    (await request("events/clean-drive/rsvp", { going: true }, leader)).status,
    409,
  );
});
test("returned work can be corrected without duplicate contribution credit", async (t) => {
  const { request, member, leader } = await fixture(t);
  await request(
    "contributions",
    { task: "welcome", summary: "Initial report" },
    member,
  );
  const c = (await request("state", null, leader)).data.contributions.find(
    (c) => c.task === "welcome",
  );
  await request(
    "contributions/review",
    { id: c.id, status: "returned", note: "Please include the outcome." },
    leader,
  );
  assert.equal(
    (
      await request(
        "contributions",
        { task: "welcome", summary: "Welcomed 30 people." },
        member,
      )
    ).status,
    201,
  );
  const list = (await request("state", null, member)).data.contributions.filter(
    (c) => c.task === "welcome",
  );
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "submitted");
});
test("session logout, cross-origin writes, and demo-disabled authentication", async (t) => {
  const { request, member } = await fixture(t);
  assert.equal(
    (
      await request("profile", { visibility: "unit" }, member, {
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("profile", { visibility: "public" }, member)).status,
    400,
  );
  assert.equal((await request("logout", {}, member)).status, 200);
  assert.equal((await request("state", null, member)).status, 401);
  const app = createApp({ database: ":memory:", demo: false });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  });
  const r = await fetch(
    `http://127.0.0.1:${app.server.address().port}/api/v1/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demoRole: "leader" }),
    },
  );
  assert.equal(r.status, 401);
});
test("single-use invitations create consenting members without leadership authority", async (t) => {
  const { request, member, leader } = await fixture(t);
  assert.equal(
    (await request("invitations", { unit: "vijayawada" }, member)).status,
    403,
  );
  const inv = (await request("invitations", { unit: "vijayawada" }, leader))
    .data;
  assert.equal(
    (await request("invitation?token=" + inv.token)).data.team,
    "Vijayawada Central",
  );
  const body = {
    token: inv.token,
    name: "New Volunteer",
    email: "new@example.test",
    password: "a-long-test-password",
    consent: true,
  };
  assert.equal(
    (await request("accept-invitation", { ...body, consent: false })).status,
    400,
  );
  const result = await request("accept-invitation", body);
  assert.equal(result.status, 201);
  const s = (await request("state", null, result.cookie)).data;
  assert.equal(s.units[0].isLeader, false);
  assert.equal(s.units.length, 1);
  assert.equal((await request("invitation?token=" + inv.token)).status, 404);
  assert.equal(
    (
      await request("accept-invitation", {
        ...body,
        email: "another@example.test",
      })
    ).status,
    404,
  );
  const login = await request("login", {
    email: body.email,
    password: body.password,
  });
  assert.equal(login.status, 200);
});
test("unit journey visibility respects consent and organization scope", async (t) => {
  const { request, member, leader, other } = await fixture(t);
  assert.equal(
    (await request("journey?user=member", null, leader)).status,
    404,
  );
  await request("profile", { visibility: "unit" }, member);
  assert.equal(
    (await request("journey?user=member", null, leader)).data.contributions
      .length,
    1,
  );
  assert.equal((await request("journey?user=member", null, other)).status, 404);
  await request("leave", { unit: "vijayawada" }, member);
  assert.equal(
    (await request("journey?user=member", null, leader)).status,
    404,
  );
  assert.equal(
    (await request("journey?user=member", null, member)).data.contributions
      .length,
    1,
  );
});
