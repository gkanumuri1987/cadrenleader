import { eventWorkflows } from "./event-workflows.mjs";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const id = () => randomBytes(12).toString("hex");
const now = () => new Date().toISOString();
const hash = (s) => createHash("sha256").update(s).digest("hex");
function password(s, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(s, salt, 64).toString("hex")}`;
}
function matches(s, stored) {
  const [salt, expected] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(password(s, salt).split(":")[1], "hex"),
  );
}
class Failure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const assert = (ok, status, message) => {
  if (!ok) throw new Failure(status, message);
};
export function createApp({
  database = process.env.DATABASE_PATH || join(root, "data/app.sqlite"),
  demo = process.env.DEMO_MODE === "1",
  secure = process.env.SECURE_COOKIE === "1",
} = {}) {
  if (database !== ":memory:")
    mkdirSync(dirname(database), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,language TEXT DEFAULT 'en',visibility TEXT DEFAULT 'private');
 CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY,org TEXT NOT NULL,name TEXT NOT NULL,parent TEXT REFERENCES units(id));
 CREATE TABLE IF NOT EXISTS memberships(user TEXT REFERENCES users(id),unit TEXT REFERENCES units(id),status TEXT NOT NULL,PRIMARY KEY(user,unit));
 CREATE TABLE IF NOT EXISTS appointments(user TEXT REFERENCES users(id),unit TEXT REFERENCES units(id),active INTEGER DEFAULT 1,PRIMARY KEY(user,unit));
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,unit TEXT REFERENCES units(id),owner TEXT REFERENCES users(id),title TEXT NOT NULL,description TEXT,venue TEXT,date TEXT NOT NULL,capacity INTEGER NOT NULL,status TEXT DEFAULT 'published',permit TEXT DEFAULT 'not_required');
 CREATE TABLE IF NOT EXISTS rsvps(event TEXT REFERENCES events(id),user TEXT REFERENCES users(id),PRIMARY KEY(event,user));
 CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,unit TEXT REFERENCES units(id),event TEXT REFERENCES events(id),assignee TEXT REFERENCES users(id),title TEXT NOT NULL,due TEXT,status TEXT DEFAULT 'open');
 CREATE TABLE IF NOT EXISTS contributions(id TEXT PRIMARY KEY,task TEXT UNIQUE REFERENCES tasks(id),user TEXT REFERENCES users(id),summary TEXT NOT NULL,status TEXT DEFAULT 'submitted',reviewer TEXT REFERENCES users(id),reviewed TEXT,note TEXT DEFAULT '',created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS contribution_revisions(id TEXT PRIMARY KEY,contribution TEXT REFERENCES contributions(id),actor TEXT REFERENCES users(id),summary TEXT,status TEXT,note TEXT,created TEXT);
 CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,unit TEXT REFERENCES units(id),user TEXT REFERENCES users(id),body TEXT NOT NULL,official INTEGER DEFAULT 0,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,unit TEXT REFERENCES units(id),creator TEXT REFERENCES users(id),expires INTEGER NOT NULL,used INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS attendance(event TEXT REFERENCES events(id),user TEXT REFERENCES users(id),present INTEGER NOT NULL,recorder TEXT REFERENCES users(id),updated TEXT NOT NULL,PRIMARY KEY(event,user));
 CREATE TABLE IF NOT EXISTS event_permits(event TEXT PRIMARY KEY REFERENCES events(id),status TEXT NOT NULL,issuer TEXT NOT NULL,reference TEXT NOT NULL,valid_until TEXT NOT NULL,conditions TEXT NOT NULL,reviewer TEXT REFERENCES users(id),reviewed TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS event_permit_revisions(id TEXT PRIMARY KEY,event TEXT REFERENCES events(id),record TEXT NOT NULL,actor TEXT REFERENCES users(id),created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS event_outcomes(event TEXT PRIMARY KEY REFERENCES events(id),summary TEXT NOT NULL,follow_up TEXT NOT NULL,author TEXT REFERENCES users(id),updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS event_cancellations(event TEXT PRIMARY KEY REFERENCES events(id),reason TEXT NOT NULL,actor TEXT REFERENCES users(id),created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS task_updates(id TEXT PRIMARY KEY,task TEXT REFERENCES tasks(id),actor TEXT REFERENCES users(id),status TEXT NOT NULL,note TEXT NOT NULL,created TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS events_unit_date ON events(unit,date);
 CREATE INDEX IF NOT EXISTS tasks_unit_assignee ON tasks(unit,assignee);
 CREATE INDEX IF NOT EXISTS memberships_user_status ON memberships(user,status);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT,action TEXT,object TEXT,created TEXT);
 CREATE INDEX IF NOT EXISTS audit_object_created ON audit(object,created);
 `);
  const get = (q, ...args) => db.prepare(q).get(...args);
  const all = (q, ...args) => db.prepare(q).all(...args);
  const run = (q, ...args) => db.prepare(q).run(...args);
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const audit = (actor, action, object) =>
    run(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      id(),
      actor,
      action,
      object,
      now(),
    );
  function addUser(uid, name, email, pw) {
    run(
      "INSERT INTO users(id,name,email,password) VALUES(?,?,?,?)",
      uid,
      name,
      email,
      password(pw),
    );
  }
  if (demo && !get("SELECT id FROM users LIMIT 1"))
    transaction(() => {
      addUser("member", "Ananya Rao", "member@demo.local", id());
      addUser("leader", "Ravi Kumar", "leader@demo.local", id());
      addUser("other", "Meera Devi", "other@demo.local", id());
      run(
        "INSERT INTO units VALUES(?,?,?,?)",
        "vijayawada",
        "demo",
        "Vijayawada Central",
        null,
      );
      run(
        "INSERT INTO units VALUES(?,?,?,?)",
        "guntur",
        "other-org",
        "Guntur Community",
        null,
      );
      run(
        "INSERT INTO memberships VALUES(?,?,?)",
        "member",
        "vijayawada",
        "active",
      );
      run(
        "INSERT INTO memberships VALUES(?,?,?)",
        "leader",
        "vijayawada",
        "active",
      );
      run("INSERT INTO memberships VALUES(?,?,?)", "other", "guntur", "active");
      run("INSERT INTO appointments VALUES(?,?,1)", "leader", "vijayawada");
      const day = (n) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };
      run(
        "INSERT INTO events(id,unit,owner,title,description,venue,date,capacity) VALUES(?,?,?,?,?,?,?,?)",
        "clean-drive",
        "vijayawada",
        "leader",
        "A cleaner neighborhood, together",
        "Join our voluntary neighborhood clean-up. Gloves, drinking water and accessible meeting space are provided.",
        "Community Park, Gate 2",
        new Date(day(3) + "T07:00").toISOString(),
        60,
      );
      run(
        "INSERT INTO events(id,unit,owner,title,description,venue,date,capacity) VALUES(?,?,?,?,?,?,?,?)",
        "team-circle",
        "vijayawada",
        "leader",
        "Community listening circle",
        "An open conversation about our next community projects. Everyone has a voice.",
        "Central Community Hall",
        new Date(day(6) + "T17:30").toISOString(),
        40,
      );
      run(
        "INSERT INTO tasks VALUES(?,?,?,?,?,?,?)",
        "welcome",
        "vijayawada",
        "clean-drive",
        "member",
        "Prepare the volunteer welcome desk",
        day(2),
        "open",
      );
      run(
        "INSERT INTO tasks VALUES(?,?,?,?,?,?,?)",
        "supplies",
        "vijayawada",
        "clean-drive",
        "leader",
        "Confirm supplies and accessibility",
        day(2),
        "open",
      );
      run(
        "INSERT INTO tasks VALUES(?,?,?,?,?,?,?)",
        "past",
        "vijayawada",
        null,
        "member",
        "Coordinate the community book exchange",
        day(-7),
        "verified",
      );
      run(
        "INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?,?)",
        "past-contribution",
        "past",
        "member",
        "Helped organize 120 donated books and welcomed 24 families.",
        "verified",
        "leader",
        now(),
        "Thank you for making everyone feel welcome.",
        now(),
      );
      run(
        "INSERT INTO posts VALUES(?,?,?,?,?,?)",
        "welcome-post",
        "vijayawada",
        "leader",
        "Small actions. Shared purpose. Our next neighborhood clean-up is open for RSVP. Choose a role that works for you — every contribution matters.",
        1,
        now(),
      );
    });
  if (
    !demo &&
    process.env.BOOTSTRAP_EMAIL &&
    !get("SELECT id FROM users LIMIT 1")
  ) {
    assert(
      (process.env.BOOTSTRAP_PASSWORD || "").length >= 14,
      500,
      "Set a bootstrap password of at least 14 characters",
    );
    transaction(() => {
      const uid = id(),
        unit = id();
      addUser(
        uid,
        process.env.BOOTSTRAP_NAME || "Administrator",
        process.env.BOOTSTRAP_EMAIL.toLowerCase(),
        process.env.BOOTSTRAP_PASSWORD,
      );
      run(
        "INSERT INTO units VALUES(?,?,?,?)",
        unit,
        id(),
        process.env.ORGANIZATION_NAME || "My organization",
        null,
      );
      run("INSERT INTO memberships VALUES(?,?,?)", uid, unit, "active");
      run("INSERT INTO appointments VALUES(?,?,1)", uid, unit);
    });
  }
  const member = (uid, unit) =>
    !!get(
      "SELECT user FROM memberships WHERE user=? AND unit=? AND status='active'",
      uid,
      unit,
    );
  const leader = (uid, unit) =>
    member(uid, unit) &&
    !!get(
      "SELECT user FROM appointments WHERE user=? AND unit=? AND active=1",
      uid,
      unit,
    );
  const scope = (uid, unit) =>
    assert(member(uid, unit), 404, "This team or record is unavailable");
  const lead = (uid, unit) => {
    scope(uid, unit);
    assert(leader(uid, unit), 403, "An active team appointment is required");
  };
  const text = (v, label, max = 2000) => {
    assert(
      typeof v === "string" && v.trim().length > 0 && v.trim().length <= max,
      400,
      `${label} is required (maximum ${max} characters)`,
    );
    return v.trim();
  };
  const workflows = eventWorkflows({
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
  });
  const rates = new Map();
  function rateLimit(key, limit = 30) {
    for (const [k, value] of rates)
      if (value.until < Date.now()) rates.delete(k);
    assert(rates.size < 10000 || rates.has(key), 429, "Please try again later");
    const r = rates.get(key) || { n: 0, until: Date.now() + 900000 };
    rates.set(key, r);
    assert(++r.n <= limit, 429, "Too many attempts. Try again in 15 minutes.");
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, data, headers = {}) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...headers,
      });
      res.end(JSON.stringify(data));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname;
      if (!path.startsWith("/api/")) {
        assert(req.method === "GET", 405, "Method not allowed");
        const files = {
          "/": "index.html",
          "/app.js": "app.js",
          "/form-payloads.js": "form-payloads.js",
          "/style.css": "style.css",
          "/manifest.webmanifest": "manifest.webmanifest",
          "/icon.svg": "icon.svg",
        };
        assert(Object.hasOwn(files, path), 404, "Not found");
        const file = files[path];
        const types = {
          html: "text/html",
          js: "text/javascript",
          css: "text/css",
          webmanifest: "application/manifest+json",
          svg: "image/svg+xml",
        };
        res.writeHead(200, {
          "Content-Type": types[file.split(".").pop()] + "; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        return res.end(readFileSync(join(root, "public", file)));
      }
      let body = {};
      if (req.method !== "GET") {
        const origin = req.headers.origin;
        assert(
          !origin ||
            origin === `${secure ? "https" : "http"}://${req.headers.host}`,
          403,
          "Request origin rejected",
        );
        assert(
          (req.headers["content-type"] || "").startsWith("application/json"),
          415,
          "Use application/json",
        );
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          assert(Buffer.byteLength(raw) <= 16384, 413, "Request too large");
        }
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          throw new Failure(400, "Invalid JSON");
        }
      }
      if (req.method !== "GET") {
        assert(
          body && typeof body === "object" && !Array.isArray(body),
          400,
          "Send a JSON object",
        );
        const required =
          {
            "/api/v1/invitations": ["unit"],
            "/api/v1/join": ["unit"],
            "/api/v1/leave": ["unit"],
            "/api/v1/membership/approve": ["unit", "user"],
            "/api/v1/posts": ["unit"],
            "/api/v1/events": ["unit"],
            "/api/v1/tasks": ["unit", "assignee"],
            "/api/v1/contributions": ["task"],
            "/api/v1/contributions/review": ["id"],
          }[path] || [];
        for (const key of required) text(body[key], key, 128);
      }
      if (path === "/api/v1/invitation" && req.method === "GET") {
        const inv = get(
          "SELECT i.*,u.name team FROM invitations i JOIN units u ON u.id=i.unit WHERE token=? AND used=0 AND expires>?",
          hash(url.searchParams.get("token") || ""),
          Date.now(),
        );
        assert(inv, 404, "This invitation is unavailable or expired");
        assert(
          leader(inv.creator, inv.unit),
          404,
          "This invitation is no longer active",
        );
        return send(200, { team: inv.team, expires: inv.expires });
      }
      const sessionCookie = (token, age = 604800) =>
        `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? "; Secure" : ""}`;
      if (path === "/api/v1/config" && req.method === "GET")
        return send(200, { demo });
      if (path === "/api/v1/accept-invitation" && req.method === "POST") {
        rateLimit(`invite:${req.socket.remoteAddress}`, 20);
        const name = text(body.name, "Display name", 80),
          email = text(body.email, "Email", 254).toLowerCase();
        assert(
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
          400,
          "Enter a valid email",
        );
        assert(
          typeof body.password === "string" &&
            body.password.length >= 14 &&
            body.password.length <= 128,
          400,
          "Use a password of 14–128 characters",
        );
        assert(
          body.consent === true,
          400,
          "Confirm you want to join this private team",
        );
        const inv = get(
          "SELECT * FROM invitations WHERE token=? AND used=0 AND expires>?",
          hash(String(body.token || "")),
          Date.now(),
        );
        assert(
          inv && leader(inv.creator, inv.unit),
          404,
          "Invitation unavailable or expired",
        );
        assert(
          !get("SELECT id FROM users WHERE email=?", email),
          409,
          "This email already has an account. Contact your team administrator.",
        );
        const uid = id(),
          token = randomBytes(32).toString("hex");
        transaction(() => {
          addUser(uid, name, email, body.password);
          run("INSERT INTO memberships VALUES(?,?,'active')", uid, inv.unit);
          run("UPDATE invitations SET used=1 WHERE token=?", inv.token);
          run(
            "INSERT INTO sessions VALUES(?,?,?)",
            hash(token),
            uid,
            Date.now() + 604800000,
          );
          audit(uid, "invitation.accepted", inv.unit);
        });
        return send(201, { ok: true }, { "Set-Cookie": sessionCookie(token) });
      }
      if (path === "/api/v1/login" && req.method === "POST") {
        rateLimit(`login:${req.socket.remoteAddress}`);
        assert(
          body.demoRole ||
            (typeof body.email === "string" &&
              typeof body.password === "string" &&
              body.password.length <= 128),
          400,
          "Enter your email and password",
        );
        run("DELETE FROM sessions WHERE expires<=?", Date.now());
        const user =
          demo && ["member", "leader"].includes(body.demoRole)
            ? get("SELECT * FROM users WHERE id=?", body.demoRole)
            : get(
                "SELECT * FROM users WHERE email=?",
                String(body.email || "")
                  .trim()
                  .toLowerCase(),
              );
        assert(
          user &&
            ((demo && ["member", "leader"].includes(body.demoRole)) ||
              matches(String(body.password || ""), user.password)),
          401,
          "Email or password is incorrect",
        );
        const token = randomBytes(32).toString("hex");
        run(
          "INSERT INTO sessions VALUES(?,?,?)",
          hash(token),
          user.id,
          Date.now() + 604800000,
        );
        return send(200, { ok: true }, { "Set-Cookie": sessionCookie(token) });
      }
      const token = (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("session="))
        ?.slice(8);
      const session =
        token &&
        get(
          "SELECT * FROM sessions WHERE token=? AND expires>?",
          hash(token),
          Date.now(),
        );
      assert(session, 401, "Please sign in");
      const uid = session.user;
      if (path === "/api/v1/logout" && req.method === "POST") {
        run("DELETE FROM sessions WHERE token=?", hash(token));
        return send(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
      }
      if (path === "/api/v1/state" && req.method === "GET") {
        const user = get(
          "SELECT id,name,email,language,visibility FROM users WHERE id=?",
          uid,
        );
        const units = all(
          "SELECT u.*,m.status FROM units u JOIN memberships m ON m.unit=u.id WHERE m.user=? AND m.status='active'",
          uid,
        ).map((u) => ({ ...u, isLeader: leader(uid, u.id) }));
        const unit = units[0]?.id;
        return send(200, {
          user,
          units,
          availableTeams: all(
            "SELECT id,name FROM units WHERE org=(SELECT u.org FROM memberships m JOIN units u ON u.id=m.unit WHERE m.user=? LIMIT 1)",
            uid,
          ),
          events: unit
            ? all(
                "SELECT e.*,(SELECT count(*) FROM rsvps r WHERE r.event=e.id) attending,EXISTS(SELECT 1 FROM rsvps r WHERE r.event=e.id AND r.user=?) going FROM events e WHERE unit=? ORDER BY date",
                uid,
                unit,
              )
            : [],
          tasks: unit
            ? all(
                `SELECT t.*,u.name assigneeName,e.title eventTitle,e.status eventStatus,(SELECT note FROM task_updates tu WHERE tu.task=t.id ORDER BY tu.created DESC,tu.rowid DESC LIMIT 1) progressNote FROM tasks t JOIN users u ON t.assignee=u.id LEFT JOIN events e ON e.id=t.event WHERE t.unit=? AND (t.assignee=? OR ?=1) ORDER BY due`,
                unit,
                uid,
                leader(uid, unit) ? 1 : 0,
              )
            : [],
          contributions: all(
            `SELECT c.*,t.title,u.name memberName FROM contributions c JOIN tasks t ON t.id=c.task JOIN users u ON u.id=c.user WHERE c.user=? OR (t.unit=? AND ?=1) ORDER BY c.created DESC`,
            uid,
            unit || "",
            unit && leader(uid, unit) ? 1 : 0,
          ),
          people: unit
            ? all(
                "SELECT u.id,u.name,EXISTS(SELECT 1 FROM appointments a WHERE a.user=u.id AND a.unit=m.unit AND active=1) isLeader FROM users u JOIN memberships m ON m.user=u.id WHERE m.unit=? AND m.status='active'",
                unit,
              )
            : [],
          posts: unit
            ? all(
                "SELECT p.*,u.name author FROM posts p JOIN users u ON u.id=p.user WHERE unit=? ORDER BY created DESC LIMIT 50",
                unit,
              )
            : [],
          demo,
        });
      }
      if (path === "/api/v1/invitations" && req.method === "POST") {
        lead(uid, body.unit);
        const token = randomBytes(32).toString("hex"),
          expires = Date.now() + 72 * 3600000;
        run(
          "INSERT INTO invitations VALUES(?,?,?,?,0)",
          hash(token),
          body.unit,
          uid,
          expires,
        );
        audit(uid, "invitation.created", body.unit);
        return send(201, { token, expires });
      }
      if (path === "/api/v1/join" && req.method === "POST") {
        assert(
          !get(
            "SELECT unit FROM memberships WHERE user=? AND status='active'",
            uid,
          ),
          409,
          "Leave your current team before requesting membership",
        );
        const unit = get("SELECT * FROM units WHERE id=?", body.unit);
        assert(unit, 404, "Team unavailable");
        // Only previously associated organization is discoverable in this MVP; invite tokens are deferred.
        assert(
          get(
            "SELECT m.unit FROM memberships m JOIN units u ON u.id=m.unit WHERE m.user=? AND u.org=?",
            uid,
            unit.org,
          ),
          403,
          "An invitation is required for this organization",
        );
        run(
          "INSERT INTO memberships VALUES(?,?,'pending') ON CONFLICT(user,unit) DO UPDATE SET status='pending'",
          uid,
          unit.id,
        );
        audit(uid, "membership.requested", unit.id);
        return send(200, {
          message: "Request sent. A team leader must approve it.",
        });
      }
      if (path === "/api/v1/requests" && req.method === "GET") {
        const unit = url.searchParams.get("unit");
        lead(uid, unit);
        return send(
          200,
          all(
            "SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user WHERE m.unit=? AND m.status='pending'",
            unit,
          ),
        );
      }
      if (path === "/api/v1/membership/approve" && req.method === "POST") {
        lead(uid, body.unit);
        transaction(() => {
          assert(
            get(
              "SELECT user FROM memberships WHERE user=? AND unit=? AND status='pending'",
              body.user,
              body.unit,
            ),
            404,
            "Request unavailable",
          );
          assert(
            !get(
              "SELECT unit FROM memberships WHERE user=? AND status='active'",
              body.user,
            ),
            409,
            "Member already has an active team",
          );
          run(
            "UPDATE memberships SET status='active' WHERE user=? AND unit=?",
            body.user,
            body.unit,
          );
          audit(uid, "membership.approved", body.user);
        });
        return send(200, { ok: true });
      }
      if (path === "/api/v1/leave" && req.method === "POST") {
        scope(uid, body.unit);
        transaction(() => {
          run(
            "UPDATE memberships SET status='left' WHERE user=? AND unit=?",
            uid,
            body.unit,
          );
          run(
            "UPDATE appointments SET active=0 WHERE user=? AND unit=?",
            uid,
            body.unit,
          );
          run(
            "DELETE FROM rsvps WHERE user=? AND event IN (SELECT id FROM events WHERE unit=? AND status IN ('published','ready','active'))",
            uid,
            body.unit,
          );
          audit(uid, "membership.left", body.unit);
        });
        return send(200, { ok: true });
      }
      if (path === "/api/v1/journey" && req.method === "GET") {
        const target = get(
          "SELECT id,name,visibility FROM users WHERE id=?",
          url.searchParams.get("user"),
        );
        assert(target, 404, "Journey unavailable");
        const shared = get(
          "SELECT a.unit FROM memberships a JOIN memberships b ON a.unit=b.unit WHERE a.user=? AND b.user=? AND a.status='active' AND b.status='active'",
          uid,
          target.id,
        );
        assert(
          target.id === uid || (target.visibility === "unit" && shared),
          404,
          "This journey is private",
        );
        return send(200, {
          name: target.name,
          contributions: all(
            "SELECT c.summary,c.reviewed,t.title FROM contributions c JOIN tasks t ON t.id=c.task WHERE c.user=? AND c.status='verified' AND (t.unit=? OR ?=1) ORDER BY c.reviewed DESC",
            target.id,
            shared?.unit || "",
            target.id === uid ? 1 : 0,
          ),
        });
      }
      if (path === "/api/v1/profile" && req.method === "POST") {
        assert(
          ["private", "unit"].includes(body.visibility),
          400,
          "Invalid visibility",
        );
        run("UPDATE users SET visibility=? WHERE id=?", body.visibility, uid);
        audit(uid, "profile.visibility", uid);
        return send(200, { ok: true });
      }
      if (path === "/api/v1/posts" && req.method === "POST") {
        scope(uid, body.unit);
        assert(
          typeof body.official === "boolean",
          400,
          "Choose a posting identity",
        );
        if (body.official) lead(uid, body.unit);
        run(
          "INSERT INTO posts VALUES(?,?,?,?,?,?)",
          id(),
          body.unit,
          uid,
          text(body.body, "Update"),
          body.official ? 1 : 0,
          now(),
        );
        return send(201, { ok: true });
      }
      if (path === "/api/v1/events" && req.method === "POST") {
        lead(uid, body.unit);
        const title = text(body.title, "Title", 120),
          venue = text(body.venue, "Venue", 200),
          date = text(body.date, "Date", 30);
        assert(
          /(Z|[+-]\d{2}:\d{2})$/.test(date) &&
            Number.isFinite(Date.parse(date)) &&
            Date.parse(date) > Date.now(),
          400,
          "Choose a future event date",
        );
        assert(
          Number.isInteger(body.capacity) &&
            body.capacity > 0 &&
            body.capacity <= 10000,
          400,
          "Capacity must be 1–10,000",
        );
        assert(
          typeof body.requiresPermit === "boolean",
          400,
          "Specify whether a permit is required",
        );
        const eid = id();
        run(
          "INSERT INTO events(id,unit,owner,title,description,venue,date,capacity,permit) VALUES(?,?,?,?,?,?,?,?,?)",
          eid,
          body.unit,
          uid,
          title,
          text(body.description, "Description"),
          venue,
          new Date(date).toISOString(),
          body.capacity,
          body.requiresPermit ? "pending" : "not_required",
        );
        audit(uid, "event.created", eid);
        return send(201, { id: eid });
      }
      if (await workflows({ path, method: req.method, body, uid, send }))
        return;
      const progressMatch = path.match(
        /^\/api\/v1\/tasks\/([a-z0-9-]+)\/progress$/,
      );
      if (progressMatch && req.method === "POST") {
        const task = get("SELECT * FROM tasks WHERE id=?", progressMatch[1]);
        assert(task, 404, "Task unavailable");
        scope(uid, task.unit);
        assert(
          task.assignee === uid,
          403,
          "Only the assigned member can update progress",
        );
        assert(
          ["open", "in_progress", "blocked"].includes(task.status),
          409,
          "Reviewed or submitted work cannot be changed here",
        );
        assert(
          ["open", "in_progress", "blocked"].includes(body.status),
          400,
          "Choose a valid progress state",
        );
        const note = text(body.note, "Progress update", 1000);
        transaction(() => {
          run("UPDATE tasks SET status=? WHERE id=?", body.status, task.id);
          run(
            "INSERT INTO task_updates VALUES(?,?,?,?,?,?)",
            id(),
            task.id,
            uid,
            body.status,
            note,
            now(),
          );
          audit(uid, "task." + body.status, task.id);
        });
        return send(200, { ok: true });
      }
      if (path === "/api/v1/tasks" && req.method === "POST") {
        lead(uid, body.unit);
        assert(
          member(body.assignee, body.unit),
          400,
          "Assignee must be an active team member",
        );
        const e =
          body.event &&
          get("SELECT unit,status FROM events WHERE id=?", body.event);
        assert(
          !body.event || e?.unit === body.unit,
          400,
          "Event must belong to your team",
        );
        assert(
          !e || !["closed", "cancelled"].includes(e.status),
          409,
          "Choose an event that is still open for work",
        );
        assert(
          /^\d{4}-\d{2}-\d{2}$/.test(body.due || "") &&
            Number.isFinite(Date.parse(body.due)) &&
            new Date(body.due).toISOString().slice(0, 10) === body.due,
          400,
          "Choose a due date",
        );
        const tid = id();
        run(
          "INSERT INTO tasks VALUES(?,?,?,?,?,?,?)",
          tid,
          body.unit,
          body.event || null,
          body.assignee,
          text(body.title, "Title", 160),
          body.due,
          "open",
        );
        audit(uid, "task.assigned", tid);
        return send(201, { id: tid });
      }
      if (path === "/api/v1/contributions" && req.method === "POST") {
        const t = get("SELECT * FROM tasks WHERE id=?", body.task);
        assert(t, 404, "Task unavailable");
        scope(uid, t.unit);
        assert(
          t.assignee === uid,
          403,
          "Only the assigned member can submit this work",
        );
        const summary = text(body.summary, "Contribution summary");
        transaction(() => {
          const existing = get(
            "SELECT * FROM contributions WHERE task=?",
            t.id,
          );
          assert(
            !existing || existing.status === "returned",
            409,
            "This task already has a contribution",
          );
          if (existing)
            run(
              "INSERT INTO contribution_revisions VALUES(?,?,?,?,?,?,?)",
              id(),
              existing.id,
              uid,
              existing.summary,
              existing.status,
              existing.note,
              now(),
            );
          if (existing)
            run(
              "UPDATE contributions SET summary=?,status='submitted',note='',reviewer=NULL,reviewed=NULL WHERE id=?",
              summary,
              existing.id,
            );
          else
            run(
              "INSERT INTO contributions(id,task,user,summary,created) VALUES(?,?,?,?,?)",
              id(),
              t.id,
              uid,
              summary,
              now(),
            );
          run("UPDATE tasks SET status='submitted' WHERE id=?", t.id);
          audit(uid, "contribution.submitted", t.id);
        });
        return send(201, { ok: true });
      }
      if (path === "/api/v1/contributions/review" && req.method === "POST") {
        const c = get(
          "SELECT c.*,t.unit FROM contributions c JOIN tasks t ON t.id=c.task WHERE c.id=?",
          body.id,
        );
        assert(c, 404, "Contribution unavailable");
        lead(uid, c.unit);
        assert(c.user !== uid, 403, "You cannot verify your own contribution");
        assert(
          ["verified", "returned"].includes(body.status),
          400,
          "Invalid decision",
        );
        const note = text(body.note, "Review note", 1000);
        transaction(() => {
          assert(
            c.status === "submitted",
            409,
            "Contribution already reviewed",
          );
          run(
            "UPDATE contributions SET status=?,reviewer=?,reviewed=?,note=? WHERE id=?",
            body.status,
            uid,
            now(),
            note,
            c.id,
          );
          run(
            "UPDATE tasks SET status=? WHERE id=?",
            body.status === "verified" ? "verified" : "open",
            c.task,
          );
          audit(uid, "contribution." + body.status, c.id);
        });
        return send(200, { ok: true });
      }
      throw new Failure(404, "Endpoint unavailable");
    } catch (e) {
      if (!e.status) console.error(e);
      send(e.status || 500, {
        error: e.status ? e.message : "Something went wrong. Please try again.",
      });
    }
  });
  return { server, db };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(
    Number(process.env.PORT || 3100),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `Cadre & Leader: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3100}`,
      ),
  );
}
