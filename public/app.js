import { formPayload } from "./form-payloads.js";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  home: "⌂",
  events: "▦",
  work: "✓",
  journey: "♧",
  community: "♙",
  review: "☷",
};
const labels = {
  home: "Overview",
  events: "Events",
  work: "My work",
  journey: "My journey",
  community: "My community",
  review: "Review queue",
};
let searchQuery = "",
  workView = "list",
  eventDetail = null,
  routeVersion = 0,
  toastTimer,
  nextFilter = null;
let state,
  page = location.hash.slice(1) || "home",
  filter = "all",
  config = { demo: false },
  invitation = null,
  invitationError = "";
const inviteToken = new URLSearchParams(location.search).get("invite");
const unit = () => state?.units[0];
const initials = (name) =>
  esc(
    name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join(""),
  );
const date = (value, options = { month: "short", day: "numeric" }) =>
  new Date(value.length === 10 ? value + "T12:00" : value).toLocaleDateString(
    "en-IN",
    options,
  );
const mine = () => state.tasks.filter((t) => t.assignee === state.user.id);
const pending = () =>
  state.contributions.filter(
    (c) => c.status === "submitted" && c.user !== state.user.id,
  );
const badge = (status) =>
  `<span class="badge ${esc(status)}">${esc(status.replaceAll("_", " "))}</span>`;
async function api(path, body) {
  const r = await fetch("/api/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error("The server could not respond. Please try again.");
  }
  if (!r.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = r.status;
    throw error;
  }
  return data;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
const pageSection = () => (page.startsWith("event/") ? "events" : page);
const eventId = () => (page.startsWith("event/") ? page.slice(6) : null);
const searchable = (...parts) =>
  parts.join(" ").toLowerCase().includes(searchQuery.toLowerCase().trim());
const openTask = (t) => ["open", "in_progress", "blocked"].includes(t.status);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const upcomingEvent = (e) =>
  ["published", "ready", "active"].includes(e.status) &&
  (Date.parse(e.date) >= Date.now() || e.status === "active");
const canRSVP = (e) => ["published", "ready", "active"].includes(e.status);
async function refresh() {
  const version = ++routeVersion;
  const nextState = await api("state");
  let detail = null;
  if (eventId()) {
    try {
      detail = await api("events/" + encodeURIComponent(eventId()));
    } catch (error) {
      if (version !== routeVersion) return;
      if (![403, 404].includes(error.status)) throw error;
      page = "events";
      history.replaceState(null, "", "#events");
      toast(error.message);
    }
  }
  if (version !== routeVersion) return;
  state = nextState;
  eventDetail = detail;
  render();
}
async function changeRoute() {
  page = location.hash.slice(1) || "home";
  filter = nextFilter || "all";
  nextFilter = null;
  searchQuery = "";
  if (!state) return;
  try {
    if (eventId()) {
      $("#main").innerHTML =
        '<div class="loading-state" role="status">Opening event workspace…</div>';
      await refresh();
    } else {
      ++routeVersion;
      eventDetail = null;
      render();
    }
    $("#main")?.focus();
    window.scrollTo(0, 0);
  } catch (err) {
    toast(err.message);
    navigate("events");
  }
}
function navigate(next, selectedFilter = null) {
  nextFilter = selectedFilter;
  if (location.hash.slice(1) === next) return changeRoute();
  location.hash = next;
}
function button(label, action, extra = "") {
  return `<button class="button ${extra}" data-action="${action}">${label}</button>`;
}
function empty(title, detail) {
  return `<div class="empty"><span>◇</span><h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
}
function login() {
  if (invitation) return inviteScreen();
  $("#app").innerHTML =
    `<div class="login"><div class="login-story"><a class="brand" href="/"><img src="/icon.svg" alt=""><span>cadre<span class="brand-light">&</span>leader</span></a><div><p class="eyebrow">PEOPLE. PURPOSE. PROGRESS.</p><h1>Great things happen<br>when we show up.<span> Together.</span></h1><p>A place to connect with your community, do meaningful work, and keep a record of the difference you make.</p><div class="login-art" aria-hidden="true"><div class="art-ring"></div><span class="art-leaf">✳</span><span class="art-circle">↗</span><div class="art-card">Small actions.<br><strong>Lasting impact.</strong></div></div></div><small>Built around people. Rooted in trust.</small></div><div class="login-form" id="main" tabindex="-1"><div class="login-inner"><span class="pill">YOUR COMMUNITY WORKSPACE</span><h2>Welcome to your next chapter.</h2><p>Sign in to pick up where your team left off.</p><form id="login-form"><label>Email address<input name="email" type="email" autocomplete="username" placeholder="you@example.com" required></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label><p class="form-error" role="alert"></p><button class="button primary wide">Sign in <span>→</span></button></form>${config.demo ? `<div class="demo-panel"><strong>Explore the working demo</strong><p>Synthetic people and sample events. Changes persist in this demo database.</p><button class="button secondary wide" data-action="login-member">Explore as a member →</button><button class="text-button" data-action="login-leader">Open leader workspace</button></div>` : '<p class="fine">Need access? Contact your organization administrator. Public registration and password recovery are not yet available.</p>'}${invitationError ? '<p class="form-error">' + esc(invitationError) + "</p>" : ""}<p class="fine">Your membership is voluntary. Your contributions are yours.</p></div></div></div>`;
}
function render() {
  if (!state) return login();
  if (!labels[pageSection()] || (page === "review" && !unit()?.isLeader))
    page = "home";
  const u = unit();
  const count = pending().length;
  $("#app").innerHTML =
    `<div class="app-layout"><aside class="sidebar"><a class="brand" href="#home" data-nav="home"><img src="/icon.svg" alt=""><span>cadre<span class="brand-light">&</span>leader</span></a><div class="workspace-label">YOUR WORKSPACE</div><div class="team-switch"><span class="team-icon">${initials(u?.name || "Personal")}</span><div><strong>${esc(u?.name || "Personal workspace")}</strong><small>${u?.isLeader ? "Leader workspace" : "Member workspace"}</small></div></div><nav aria-label="Main navigation">${Object.entries(
      labels,
    )
      .filter(([key]) => key !== "review" || u?.isLeader)
      .map(
        ([key, label]) =>
          `<a href="#${key}" data-nav="${key}" class="nav-item ${pageSection() === key ? "active" : ""}" ${pageSection() === key ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icons[key]}</span>${label}${key === "review" && count ? `<b>${count}</b>` : ""}</a>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><div class="purpose-note"><span>✳</span><strong>A little effort.<br>A bigger difference.</strong><p>Every contribution has a story. Make yours count.</p></div><button class="user-card" data-action="profile"><span class="avatar">${initials(state.user.name)}</span><span><strong>${esc(state.user.name)}</strong><small>Account & privacy</small></span><span>⌄</span></button><button class="text-button logout" data-action="logout">Sign out</button></div></aside><div class="main-wrap"><header class="topbar"><span>Workspace <span class="crumb">/</span> <strong>${labels[pageSection()]}</strong></span><div class="topbar-right">${state.demo ? '<span class="demo-label">DEMO WORKSPACE</span>' : ""}<span class="privacy-tag">◈ Private team</span><button class="avatar small account-button" aria-label="Account and privacy" data-action="profile">${initials(state.user.name)}</button></div></header><nav class="mobile-nav" aria-label="Mobile navigation">${["home", "events", "work", "journey", "community", ...(u?.isLeader ? ["review"] : [])].map((k) => `<a href="#${k}" data-nav="${k}" class="${k === pageSection() ? "active" : ""}"><span>${icons[k]}</span>${k === "home" ? "Home" : k === "community" ? "Team" : k === "review" ? "Review" : labels[k].replace("My ", "")}</a>`).join("")}</nav><main id="main" tabindex="-1">${eventId() ? eventWorkspace() : { home, events, work, journey, community, review }[page]()}</main><footer>Made for meaningful participation.<span>Membership is always your choice.</span></footer></div></div>`;
}
function heading(kicker, title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function eventCard(e, compact = false) {
  return `<article class="event-card ${compact ? "compact" : ""}"><div class="event-visual ${e.id === "team-circle" ? "blue" : ""}"><div class="date-tile"><strong>${new Date(e.date).getDate()}</strong><span>${date(e.date, { month: "short" }).toUpperCase()}</span></div><span class="event-art" aria-hidden="true">${e.id === "team-circle" ? "◌" : "✳"}</span><span class="event-kind">${e.permit === "pending" ? "PRELIMINARY · PERMIT PENDING" : "COMMUNITY"}</span></div><div class="event-content"><div class="event-meta">${esc(date(e.date, { weekday: "short", month: "short", day: "numeric" }))} <span>·</span> ${new Date(e.date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div><h3><button class="title-button" data-action="event" data-id="${e.id}">${esc(e.title)}</button></h3><p class="venue">⌖ ${esc(e.venue)}</p><div class="event-bottom"><span><span class="tiny-avatar">${e.attending ? "✓" : "♙"}</span> ${e.attending} / ${e.capacity} attending</span><button class="${e.going ? "going" : "rsvp-button"}" data-action="${canRSVP(e) ? "rsvp" : "event"}" data-id="${e.id}">${canRSVP(e) ? (e.going ? "✓ Going" : "RSVP ↗") : esc(e.status)}</button></div></div></article>`;
}
function taskRow(t) {
  const c = state.contributions.find((c) => c.task === t.id);
  const overdue = openTask(t) && t.due < today();
  return `<article class="task-row ${t.status === "blocked" ? "task-blocked" : ""}"><span class="task-check ${t.status === "verified" ? "complete" : ""}" aria-hidden="true">${t.status === "verified" ? "✓" : "○"}</span><div class="task-copy"><div class="task-status-line">${badge(c?.status === "returned" ? "returned" : t.status)} ${overdue ? '<span class="overdue-label">Overdue</span>' : ""}</div><strong>${esc(t.title)}</strong><small>${esc(t.eventTitle || "Community contribution")} ${unit()?.isLeader ? " · " + esc(t.assigneeName) : ""}${t.eventStatus === "cancelled" ? " · Event cancelled" : ""}</small>${t.progressNote && openTask(t) ? `<p class="progress-note">${esc(t.progressNote)}</p>` : ""}${c?.status === "returned" ? `<div class="return-note"><strong>Clarification requested</strong>${esc(c.note)}</div>` : ""}</div><div class="task-right"><span class="due">Due ${date(t.due)}</span>${openTask(t) && t.assignee === state.user.id ? `<button class="text-button" data-action="task-progress" data-id="${t.id}">Update progress</button><button class="button secondary small-button" data-action="submit" data-id="${t.id}">${c?.status === "returned" ? "Resubmit work" : "Submit work"} →</button>` : ""}</div></article>`;
}
function home() {
  const tasks = mine().filter(openTask),
    upcoming = state.events.filter(upcomingEvent),
    verified = state.contributions.filter(
      (c) => c.user === state.user.id && c.status === "verified",
    );
  return `${heading("LET’S MAKE TODAY MATTER", `Good to see you, ${esc(state.user.name.split(" ")[0])}.`, "Your community is moving forward. Here’s where you come in.", unit()?.isLeader ? button("+ Create event", "create-event", "primary") : button("Explore events ↗", "events", "secondary"))}<section class="hero"><div><span class="hero-label">CONNECTED BY PURPOSE</span><h2>Your time. Your effort.<br><em>A stronger community.</em></h2><p>Show up for what matters. Find your next opportunity<br class="desktop-only"> to make a difference, with people who care.</p><button class="button light" data-nav="events">Find your next event <span>↗</span></button></div><div class="hero-art" aria-hidden="true"><div class="orbit one"></div><div class="orbit two"></div><span class="hero-sun">✳</span><div class="hero-ticket"><span>↗</span><strong>Better,<br>together.</strong><small>ONE CONTRIBUTION AT A TIME</small></div><div class="hero-dot"></div></div></section>${focusPanel()}<section class="stats" aria-label="Your activity"><div><span class="stat-icon orange">▦</span><div><strong>${upcoming.length.toString().padStart(2, "0")}</strong><span>Upcoming events</span></div></div><div><span class="stat-icon green">✓</span><div><strong>${tasks.length.toString().padStart(2, "0")}</strong><span>Tasks to take forward</span></div></div><div><span class="stat-icon purple">♧</span><div><strong>${verified.length.toString().padStart(2, "0")}</strong><span>Verified contributions</span></div></div></section><div class="dashboard-grid"><div><section><div class="section-title"><div><h2>Coming up in your community</h2><p>Good things to be a part of.</p></div><button class="text-button" data-nav="events">All events ↗</button></div><div class="event-grid">${
    upcoming
      .slice(0, 2)
      .map((e) => eventCard(e, true))
      .join("") ||
    empty("Your next chapter starts here", "New team events will appear here.")
  }</div></section><section class="work-preview"><div class="section-title"><div><h2>A little focus, a little progress</h2><p>Your next steps, all in one place.</p></div><button class="text-button" data-nav="work">My work ↗</button></div><div class="card">${tasks.slice(0, 3).map(taskRow).join("") || empty("You’re all caught up", "Explore an event or check back for new tasks.")}</div></section></div><aside class="right-column"><section class="team-note card"><div class="section-title"><h2>From your team</h2><span class="spark">✳</span></div>${
    state.posts
      .slice(0, 1)
      .map(
        (p) =>
          `<div class="post-author"><span class="avatar">${initials(p.author)}</span><div><strong>${esc(p.author)}</strong><small>${p.official ? "Official team update" : "Team member"} · ${date(p.created)}</small></div></div><p class="post-body">${esc(p.body)}</p>`,
      )
      .join("") || "<p>No updates yet. Share the first one.</p>"
  }<button class="text-button" data-nav="community">Visit your community →</button></section><section class="journey-note"><span class="eyebrow">YOUR STORY IS TAKING SHAPE</span><div class="journey-flower" aria-hidden="true">♧</div><h2>Every effort<br>leaves a mark.</h2><p>Your contributions become part of a journey you can look back on.</p><button class="text-button" data-nav="journey">See my journey ↗</button></section></aside></div>`;
}
function searchBox(placeholder) {
  return `<label class="search-box"><span aria-hidden="true">⌕</span><input type="search" data-search aria-label="${placeholder}" placeholder="${placeholder}" value="${esc(searchQuery)}"></label>`;
}
function focusPanel() {
  const tasks = unit()?.isLeader ? state.tasks : mine(),
    late = tasks.filter((t) => openTask(t) && t.due < today()).length,
    blocked = tasks.filter((t) => t.status === "blocked").length;
  return `<section class="focus-panel" aria-label="Next actions"><div><span class="eyebrow">MAKE YOUR NEXT MOVE</span><h2>What needs your attention</h2></div><button data-action="focus-work" data-target-filter="overdue"><strong>${late}</strong><span>Overdue tasks ↗</span></button><button data-action="focus-work" data-target-filter="blocked"><strong>${blocked}</strong><span>Tasks needing help ↗</span></button>${unit()?.isLeader ? `<button data-nav="review"><strong>${pending().length}</strong><span>Waiting for review ↗</span></button>` : `<button data-action="focus-events" data-target-filter="going"><strong>${state.events.filter((e) => e.going && upcomingEvent(e)).length}</strong><span>Events you’re joining ↗</span></button>`}</section>`;
}
function events() {
  const list = state.events.filter(
    (e) =>
      (filter === "all" ||
        (filter === "going"
          ? e.going && canRSVP(e)
          : filter === "past"
            ? !upcomingEvent(e)
            : upcomingEvent(e))) &&
      searchable(e.title, e.venue, e.description),
  );
  return `${heading("COME TOGETHER. FOLLOW THROUGH.", "Your community, in motion.", "Plan with clarity, participate freely, and record what you achieve.", unit()?.isLeader ? button("+ Create event", "create-event", "primary") : "")}<div class="toolbar event-toolbar"><div class="tabs" aria-label="Event filters">${[
    ["all", "All events"],
    ["upcoming", "Upcoming"],
    ["going", "I’m going"],
    ["past", "Past & closed"],
  ]
    .map(
      ([k, l]) =>
        `<button aria-pressed="${filter === k}" class="${filter === k ? "selected" : ""}" data-filter="${k}">${l}</button>`,
    )
    .join(
      "",
    )}</div>${searchBox("Search events or places")}</div><div class="results-count" role="status">${list.length} ${list.length === 1 ? "event" : "events"}${searchQuery ? " matching your search" : ""}</div><div class="event-grid full">${list.map((e) => eventCard(e)).join("") || empty("No matching events", "Try another search or filter.")}</div>`;
}
function work() {
  const tasks = state.tasks.filter(
    (t) =>
      (filter === "all" ||
        (filter === "overdue"
          ? openTask(t) && t.due < today()
          : t.status === filter)) &&
      searchable(t.title, t.assigneeName, t.eventTitle, t.progressNote),
  );
  const columns = [
    ["open", "To do"],
    ["in_progress", "In progress"],
    ["blocked", "Needs help"],
    ["submitted", "In review"],
    ["verified", "Verified"],
  ];
  const board = columns
    .map(([key, label]) => {
      const list = tasks.filter((t) => t.status === key);
      return `<section class="board-column"><h2>${label}<span>${list.length}</span></h2>${list.map(taskRow).join("") || '<p class="board-empty">No tasks here</p>'}</section>`;
    })
    .join("");
  return `${heading("MOVE GOOD WORK FORWARD", unit()?.isLeader ? "Clarity for every contribution." : "One task. A meaningful difference.", "Share progress, flag a blocker, and submit your finished work for review.", unit()?.isLeader ? button("+ Assign task", "create-task", "primary") : "")}<div class="work-summary"><span><strong>${state.tasks.filter(openTask).length}</strong> active tasks</span><span><strong>${state.tasks.filter((t) => t.status === "blocked").length}</strong> need support</span><span><strong>${state.tasks.filter((t) => t.status === "verified").length}</strong> verified</span></div><div class="toolbar work-toolbar">${searchBox("Search tasks, people or events")}<div class="view-switch" aria-label="Task view"><button data-view="list" aria-pressed="${workView === "list"}" class="${workView === "list" ? "selected" : ""}">List</button><button data-view="board" aria-pressed="${workView === "board"}" class="${workView === "board" ? "selected" : ""}">Board</button></div></div><div class="tabs work-tabs">${[["all", "All work"], ["overdue", "Overdue"], ...columns].map(([k, l]) => `<button data-filter="${k}" aria-pressed="${filter === k}" class="${filter === k ? "selected" : ""}">${l}</button>`).join("")}</div><div class="results-count" role="status">${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}</div>${workView === "board" ? `<div class="task-board">${board}</div>` : `<div class="card">${tasks.map(taskRow).join("") || empty("No matching tasks", "Try another search or filter.")}</div>`}`;
}
function eventWorkspace() {
  if (!eventDetail)
    return '<div class="loading-state" role="status">Opening event workspace…</div>';
  const d = eventDetail,
    e = d.event,
    isLeader = unit()?.isLeader;
  const steps = ["published", "ready", "active", "completed", "closed"],
    position = steps.indexOf(e.status);
  const next = {
    published: ["ready", "Mark ready"],
    ready: ["active", "Start event"],
    active: ["completed", "Complete event"],
    completed: ["closed", "Close event"],
  }[e.status];
  const progress = steps
    .map(
      (step, i) =>
        `<li class="${i <= position ? "done" : ""}" ${step === e.status ? 'aria-current="step"' : ""}><span>${i < position ? "✓" : i + 1}</span>${step === "published" ? "Published" : step === "ready" ? "Ready" : step === "active" ? "Active" : step === "completed" ? "Completed" : "Closed"}</li>`,
    )
    .join("");
  return `<button class="text-button back-link" data-nav="events">← All events</button><div class="event-workspace-heading"><div><div class="event-heading-meta">${badge(e.status)}<span>${esc(unit().name)}</span></div><h1>${esc(e.title)}</h1><p>⌖ ${esc(e.venue)} <span>·</span> ${date(e.date, { weekday: "long", month: "short", day: "numeric" })} at ${new Date(e.date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</p></div><div class="heading-actions">${canRSVP(e) ? `<button class="button ${e.going ? "secondary" : "primary"}" data-action="rsvp" data-id="${e.id}">${e.going ? "✓ Going · Withdraw" : "RSVP to this event →"}</button>` : ""}</div></div>${d.cancellation ? `<div class="notice warning"><strong>This event has been cancelled</strong><p>${esc(d.cancellation.reason)}</p></div>` : `<ol class="event-stepper" aria-label="Event lifecycle">${progress}</ol>`}<div class="event-workspace-grid"><div><section class="card padded event-about"><h2>About this gathering</h2><p>${esc(e.description)}</p><div class="event-facts"><div><strong>${e.attending}<small> / ${e.capacity}</small></strong><span>RSVPs confirmed</span></div><div><strong>${d.attendanceCount}</strong><span>Attendance confirmed</span></div><div><strong>${d.tasks.filter((t) => t.status === "verified").length}<small> / ${d.tasks.length}</small></strong><span>${isLeader ? "Team tasks verified" : "Your tasks verified"}</span></div></div>${!isLeader && d.myAttendance !== null ? `<p class="attendance-notice">${d.myAttendance ? "✓ Your attendance is confirmed." : "Your attendance is currently marked absent."} Contact the organizer for corrections.</p>` : ""}</section><section class="event-tasks"><div class="section-title"><h2>${isLeader ? "The work behind the event" : "Your event tasks"}</h2>${isLeader && e.status !== "closed" && e.status !== "cancelled" ? button("+ Assign task", "create-task", "secondary small-button") : ""}</div><div class="card">${d.tasks.map((t) => taskRow(state.tasks.find((item) => item.id === t.id) || t)).join("") || empty("No tasks yet", isLeader ? "Assign responsibilities so everyone knows the next step." : "Your assigned event tasks will appear here.")}</div></section>${isLeader ? `<section class="card padded attendance-section"><div class="section-title"><div><h2>People showing up</h2><p>Organizer-confirmed attendance. Corrections remain available until closure.</p></div><span class="count-chip">${d.attendees.length}</span></div>${d.attendees.map((p) => `<div class="attendance-row"><span class="avatar">${initials(p.name)}</span><div><strong>${esc(p.name)}</strong><small>${p.present ? "Attendance confirmed" : "RSVP confirmed"}</small></div>${["active", "completed"].includes(e.status) ? `<button class="button ${p.present ? "secondary" : "primary"} small-button" data-action="attendance" data-id="${p.id}" data-present="${!p.present}">${p.present ? "Undo check-in" : "Check in"}</button>` : badge(p.present ? "present" : "registered")}</div>`).join("") || '<p class="muted">Members will appear here when they RSVP.</p>'}</section>` : ""}<section class="card padded outcome-section"><div class="section-title"><h2>What we achieved</h2>${isLeader && e.status === "completed" ? button(d.outcome ? "Edit outcome" : "Record outcome", "outcome", "secondary small-button") : ""}</div>${d.outcome ? `<p class="outcome-copy">${esc(d.outcome.summary)}</p><h3>What happens next</h3><p class="outcome-copy">${esc(d.outcome.follow_up)}</p><small class="muted">Updated ${date(d.outcome.updated)}</small>` : '<p class="muted">After the event, record the outcomes and a follow-up plan before closing it.</p>'}</section></div><aside><section class="card padded organizer-panel"><p class="eyebrow">${isLeader ? "ORGANIZER DESK" : "EVENT READINESS"}</p><h2>${e.status === "cancelled" ? "Event cancelled" : e.status === "closed" ? "A chapter completed" : next ? next[1] : "Event progress"}</h2><p>${isLeader ? "Keep the team informed as the event moves forward." : "Your organizer coordinates permissions, attendance, and follow-ups."}</p><div class="readiness-item"><span>${d.permitValid ? "✓" : "!"}</span><div><strong>${e.permit === "not_required" ? "No permit required" : d.permitValid ? "Permission verified" : "Permission needs attention"}</strong><small>${e.permit === "not_required" ? "Recorded by the organizer" : d.permit?.valid_until ? "Valid until " + date(d.permit.valid_until) : "Readiness requires a recorded review."}</small></div></div>${e.permit !== "not_required" && isLeader && ["published", "ready"].includes(e.status) ? button("Review permission", "permit", "secondary wide") : ""}${d.permit ? `<dl class="permit-summary"><dt>Issuing authority</dt><dd>${esc(d.permit.issuer)}</dd><dt>Reference</dt><dd>${esc(d.permit.reference)}</dd><dt>Conditions</dt><dd>${esc(d.permit.conditions)}</dd></dl>` : ""}${isLeader && next ? `<button class="button primary wide" data-action="event-status" data-id="${e.id}" data-status="${next[0]}" ${(["ready", "active"].includes(next[0]) && !d.permitValid) || (next[0] === "closed" && !d.outcome) ? "disabled" : ""}>${next[1]} →</button>${next[0] === "closed" && !d.outcome ? '<p class="fine">Record the outcome and follow-up plan to enable closure.</p>' : ""}` : ""}${isLeader && ["published", "ready", "active"].includes(e.status) ? '<button class="text-button danger cancel-link" data-action="cancel-event">Cancel this event</button>' : ""}</section>${isLeader ? `<section class="card padded event-history"><h2>Activity log</h2>${d.history.map((h) => `<div><span class="history-dot"></span><p><strong>${esc(h.action.replace("event.", "").replaceAll("_", " "))}</strong><small>${esc(h.actorName || "Organizer")} · ${date(h.created)}</small></p></div>`).join("") || '<p class="muted">New event decisions will appear here.</p>'}</section>` : ""}</aside></div>`;
}
function journey() {
  const contributions = state.contributions.filter(
    (c) => c.user === state.user.id,
  );
  return `${heading("YOUR EFFORT HAS A STORY", "A journey that belongs to you.", "A personal record of the time, care, and energy you’ve shared.", button("◈ Privacy settings", "profile", "secondary"))}<section class="journey-header card"><span class="avatar large">${initials(state.user.name)}</span><div><h2>${esc(state.user.name)}</h2><p>${esc(unit()?.name || "Independent member")} · Journey visibility: ${state.user.visibility === "private" ? "Only me" : "My unit"}</p></div><div class="journey-total"><strong>${contributions.filter((c) => c.status === "verified").length}</strong><span>verified contributions</span></div></section><div class="timeline">${contributions.map((c) => `<article class="timeline-item"><span class="timeline-dot">${c.status === "verified" ? "✓" : "○"}</span><div class="card"><div class="timeline-top"><span>${date(c.created, { day: "numeric", month: "long", year: "numeric" })}</span>${badge(c.status)}</div><h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p>${c.note ? `<blockquote>${esc(c.note)}<small>${c.status === "verified" ? "Verified" : "Reviewed"} ${date(c.reviewed)}</small></blockquote>` : ""}</div></article>`).join("") || empty("Your story is just getting started", "Submit your first completed task to begin your journey.")}</div>`;
}
function community() {
  const u = unit();
  return `${heading("A SHARED SENSE OF BELONGING", "People make the community.", "Stay connected, share progress, and participate on your own terms.", u ? `<div class="heading-actions">${u.isLeader ? button("Invite a member", "invite", "secondary") : ""}${button("+ Share an update", "create-post", "primary")}</div>` : "")} ${!u ? `<section class="card padded"><h2>You’re not currently in a team</h2><p>Your personal contribution history stays available in My journey. Rejoining requires leader approval.</p>${state.availableTeams.map((t) => `<button class="button secondary" data-action="join" data-id="${t.id}">Request to join ${esc(t.name)}</button>`).join("")}</section>` : `<div class="community-grid"><section class="card padded"><p class="eyebrow">YOUR PRIMARY TEAM</p><h2>${esc(u.name)}</h2><p>${state.people.length} members · Private workspace</p><div class="member-list">${state.people.map((p) => `<div><span class="avatar">${initials(p.name)}</span><button class="text-button member-name" data-action="member-journey" data-id="${p.id}">${esc(p.name)}</button><span class="muted">${p.isLeader ? "Appointed leader" : "Member"}</span></div>`).join("")}</div><button class="text-button danger" data-action="leave">Leave this team</button></section><section><h2 class="feed-heading">The community board</h2>${state.posts.map((p) => `<article class="card feed-post"><div class="post-author"><span class="avatar">${initials(p.author)}</span><div><strong>${esc(p.author)}</strong><small>${p.official ? "Official team update" : "Member update"} · ${date(p.created)}</small></div></div><p>${esc(p.body)}</p><span class="fine">◈ Visible to this team</span></article>`).join("") || empty("A fresh start", "Share an update with your team.")}</section></div>`}`;
}
function review() {
  return `${heading("RECOGNIZE WORK. BUILD TRUST.", "Give good work its due.", "Review the outcome, give a clear reason, and recognize each contribution fairly.", button("Membership requests", "requests", "secondary"))}<div class="review-grid">${
    pending()
      .map(
        (c) =>
          `<article class="card padded"><div class="post-author"><span class="avatar">${initials(c.memberName)}</span><div><strong>${esc(c.memberName)}</strong><small>Submitted ${date(c.created)}</small></div>${badge(c.status)}</div><h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p><button class="button primary" data-action="review" data-id="${c.id}">Review contribution →</button></article>`,
      )
      .join("") ||
    empty(
      "The queue is clear",
      "New contribution submissions from your team will appear here. Your own work must be reviewed by another appointed leader.",
    )
  }</div>`;
}
function modal(title, content) {
  const d = $("#modal");
  d.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close" aria-label="Close dialog">×</button></div>${content}`;
  d.showModal();
}
function form(fields, action, label) {
  return `<form data-form="${action}">${fields}<p class="form-error" role="alert"></p><button class="button primary wide">${label}</button></form>`;
}
function field(label, name, type = "text", required = true) {
  return `<label>${label}<input name="${name}" type="${type}" ${required ? "required" : ""}></label>`;
}
function textarea(label, name) {
  return `<label>${label}<textarea name="${name}" rows="4" required maxlength="2000"></textarea></label>`;
}
let selectedId;
async function action(name, target) {
  selectedId = target?.dataset.id || selectedId;
  if (name === "focus-work")
    return navigate("work", target.dataset.targetFilter);
  if (name === "focus-events") return navigate("events", "going");
  if (name === "close") return $("#modal").close();
  if (name.startsWith("login-")) {
    await api("login", { demoRole: name.slice(6) });
    return refresh();
  }
  if (["events"].includes(name)) return navigate(name);
  if (name === "logout") {
    await api("logout", {});
    $("#modal").close();
    state = null;
    return login();
  }
  if (name === "rsvp") {
    const e = state.events.find((e) => e.id === selectedId);
    await api(`events/${e.id}/rsvp`, { going: !e.going });
    await refresh();
    return toast(
      e.going ? "RSVP withdrawn" : "You’re on the list. See you there!",
    );
  }
  if (name === "event") return navigate("event/" + selectedId);
  if (name === "attendance") {
    await api(`events/${eventId()}/attendance`, {
      user: selectedId,
      present: target.dataset.present === "true",
    });
    await refresh();
    return toast("Attendance updated");
  }
  if (name === "task-progress") {
    const t = state.tasks.find((t) => t.id === selectedId);
    return modal(
      "Move your work forward",
      form(
        `<p>${esc(t.title)}</p><label>Progress<select name="status">${[
          ["open", "To do"],
          ["in_progress", "In progress"],
          ["blocked", "I need help"],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${t.status === v ? "selected" : ""}>${l}</option>`,
          )
          .join(
            "",
          )}</select></label>${textarea("What’s changed, or what support do you need?", "note")}`,
        "task-progress",
        "Save progress",
      ),
    );
  }
  if (name === "permit") {
    const p = eventDetail.permit;
    modal(
      "Review external permission",
      form(
        `<p>Record evidence you have inspected. This records your review; it does not obtain permission from an authority.</p><label>Decision<select name="status"><option value="approved">Verified and approved</option><option value="rejected">Rejected</option></select></label>${field("Issuing authority", "issuer")}${field("Permit or document reference", "reference")}<div data-permit-expiration>${field("Valid until (your local time)", "validUntil", "datetime-local")}</div>${textarea("Conditions or review note", "conditions")}<label class="checkbox"><input type="checkbox" name="confirmed" required> I inspected the evidence and confirmed this decision.</label>`,
        "permit",
        "Save permission review",
      ),
    );
    if (p) {
      for (const k of ["issuer", "reference", "conditions"])
        $('#modal [name="' + k + '"]').value = p[k];
    }
    return;
  }
  if (name === "outcome") {
    modal(
      "Turn participation into progress",
      form(
        `${textarea("What did the event achieve?", "summary")}${textarea("Follow-up actions, owners and next steps", "followUp")}`,
        "outcome",
        "Save event outcome",
      ),
    );
    if (eventDetail.outcome) {
      $('#modal [name="summary"]').value = eventDetail.outcome.summary;
      $('#modal [name="followUp"]').value = eventDetail.outcome.follow_up;
    }
    return;
  }
  if (name === "cancel-event")
    return modal(
      "Cancel this event?",
      form(
        `${textarea("Reason to share with your team", "reason")}<p class="fine">RSVP changes will close and an official cancellation update will appear on the team board. Previous records remain available.</p>`,
        "cancel-event",
        "Confirm cancellation",
      ),
    );
  if (name === "event-status") {
    await api(`events/${selectedId}/status`, { status: target.dataset.status });
    $("#modal").close();
    await refresh();
    return toast("Event updated");
  }
  if (name === "submit") {
    const t = state.tasks.find((t) => t.id === selectedId);
    modal(
      "Share your contribution",
      `<p>${esc(t.title)}</p>${state.contributions.find((c) => c.task === t.id)?.status === "returned" ? `<div class="return-note">${esc(state.contributions.find((c) => c.task === t.id).note)}</div>` : ""}${form(textarea("What did you do, and what was the outcome?", "summary"), "submit", "Submit for verification →")}<p class="fine">Include the work you completed and any relevant context. Your team leader will review it.</p>`,
    );
    const previous = state.contributions.find((c) => c.task === t.id);
    if (previous?.status === "returned")
      $('#modal [name="summary"]').value = previous.summary;
    return;
  }
  if (name === "review")
    return modal(
      "Review contribution",
      form(
        `<label>Decision<select name="status"><option value="verified">Verify this contribution</option><option value="returned">Return for clarification</option></select></label>${textarea("Explain your decision", "note")}`,
        "review",
        "Save review",
      ),
    );
  if (name === "create-event")
    return modal(
      "Bring your community together",
      form(
        `${field("Event title", "title")}${textarea("What will we do?", "description")}${field("Meeting place", "venue")}${field("Date and time (local)", "date", "datetime-local")}${field("Capacity", "capacity", "number")}<label class="checkbox"><input type="checkbox" name="requiresPermit"> This event needs an external permit</label><p class="fine">Record permission evidence in the event workspace before marking the event ready.</p>`,
        "create-event",
        "Publish event →",
      ),
    );
  if (name === "create-task")
    return modal(
      "Make the next step clear",
      form(
        `${field("Task title", "title")}<label>Assign to<select name="assignee">${state.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Related event<select name="event"><option value="">No event</option>${state.events
          .filter((e) => !["closed", "cancelled"].includes(e.status))
          .map(
            (e) =>
              `<option value="${e.id}" ${eventId() === e.id ? "selected" : ""}>${esc(e.title)}</option>`,
          )
          .join("")}</select></label>${field("Due date", "due", "date")}`,
        "create-task",
        "Assign task →",
      ),
    );
  if (name === "create-post")
    return modal(
      "Share with your team",
      form(
        `${unit()?.isLeader ? '<label>Post as<select name="official"><option value="false">Me — ' + esc(state.user.name) + '</option><option value="true">Official team identity</option></select></label>' : ""}${textarea("Your update", "body")}<p class="fine">Audience: ${esc(unit().name)}. Text updates only in this release.</p>`,
        "create-post",
        "Publish to team →",
      ),
    );
  if (name === "profile")
    return modal(
      "Your account & privacy",
      `<p><strong>${esc(state.user.name)}</strong><br>${esc(state.user.email)}</p>${form(`<label>My journey is visible to<select name="visibility"><option value="private" ${state.user.visibility === "private" ? "selected" : ""}>Only me</option><option value="unit" ${state.user.visibility === "unit" ? "selected" : ""}>My unit</option></select></label><p class="fine">Authorized reviewers can see submissions they need to verify. Public journey sharing is not available.</p>`, "profile", "Save preferences")}<button class="text-button logout-modal" data-action="logout">Sign out</button>`,
    );
  if (name === "leave")
    return modal(
      "Leave your team?",
      `<p>You can leave without leader approval. Private team access and your RSVPs will end immediately. Your personal contribution history remains available.</p>${form('<label class="checkbox"><input type="checkbox" name="confirmed" required> I understand and want to leave this team.</label>', "leave", "Leave team")}`,
    );
  if (name === "join") {
    await api("join", { unit: selectedId });
    toast("Request sent for leader approval");
    return;
  }
  if (name === "member-journey") {
    const j = await api("journey?user=" + encodeURIComponent(selectedId));
    return modal(
      esc(j.name) + "’s journey",
      j.contributions
        .map(
          (c) =>
            `<article class="shared-contribution"><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p>${badge("verified")} <span class="fine">${date(c.reviewed)}</span></article>`,
        )
        .join("") || "<p>No shared verified contributions yet.</p>",
    );
  }
  if (name === "invite") {
    const inv = await api("invitations", { unit: unit().id });
    const link = location.origin + "/?invite=" + inv.token;
    return modal(
      "A place in your community",
      `<p>Send this single-use invitation to the person you want to invite. It expires in 72 hours and grants membership in ${esc(unit().name)} when accepted.</p><label>Invitation link<input readonly value="${esc(link)}"></label><p class="fine">Share this link privately. It grants access to your private team. Email delivery and contact verification are not yet integrated.</p>`,
    );
  }
  if (name === "requests") {
    const requests = await api("requests?unit=" + unit().id);
    return modal(
      "Membership requests",
      requests
        .map(
          (r) =>
            `<div class="request-row"><strong>${esc(r.name)}</strong><button class="button secondary" data-action="approve" data-id="${r.id}">Approve</button></div>`,
        )
        .join("") || "<p>No requests are waiting for approval.</p>",
    );
  }
  if (name === "approve") {
    await api("membership/approve", { unit: unit().id, user: selectedId });
    $("#modal").close();
    await refresh();
    toast("Membership approved");
  }
}
document.addEventListener("click", async (e) => {
  if (e.target.closest(".skip")) {
    e.preventDefault();
    $("#main")?.focus();
    return;
  }
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    e.preventDefault();
    navigate(nav.dataset.nav);
    return;
  }
  const f = e.target.closest("[data-filter]");
  if (f) {
    filter = f.dataset.filter;
    render();
    return;
  }
  const view = e.target.closest("[data-view]");
  if (view) {
    workView = view.dataset.view;
    render();
    return;
  }
  const t = e.target.closest("[data-action]");
  if (!t) return;
  t.disabled = true;
  try {
    await action(t.dataset.action, t);
    if (t.dataset.action === "rsvp" && $("#modal").open) $("#modal").close();
  } catch (err) {
    if (err.status === 401) {
      state = null;
      $("#modal").close();
      login();
    }
    toast(err.message);
  } finally {
    t.disabled = false;
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formEl = e.target;
  const submit = formEl.querySelector(
    'button[type="submit"],button:not([type])',
  );
  if (submit) submit.disabled = true;
  const values = Object.fromEntries(new FormData(formEl));
  const error = formEl.querySelector(".form-error");
  if (error) error.textContent = "";
  try {
    if (formEl.id === "invite-form") {
      await api("accept-invitation", {
        ...values,
        token: inviteToken,
        consent: values.consent === "on",
      });
      invitation = null;
      history.replaceState(null, "", "/");
    } else if (formEl.id === "login-form") await api("login", values);
    else {
      const type = formEl.dataset.form;
      const [route, body] = formPayload(type, values, {
        unit: unit()?.id,
        selectedId,
        eventId: eventId(),
      });
      await api(route, body);
      $("#modal").close();
      toast("Saved successfully");
    }
    await refresh();
  } catch (err) {
    if (error) error.textContent = err.message;
    else toast(err.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});
document.addEventListener("change", (event) => {
  if (!event.target.matches('[data-form="permit"] [name="status"]')) return;
  const rejected = event.target.value === "rejected";
  $("#modal [data-permit-expiration]").hidden = rejected;
  $('#modal [name="validUntil"]').required = !rejected;
});
window.addEventListener("hashchange", changeRoute);
document.addEventListener("input", (e) => {
  if (!e.target.matches("[data-search]")) return;
  const cursor = e.target.selectionStart;
  searchQuery = e.target.value;
  render();
  const input = $("[data-search]");
  input?.focus();
  input?.setSelectionRange(cursor, cursor);
});
(async () => {
  try {
    config = await api("config");
    if (inviteToken) {
      try {
        invitation = await api(
          "invitation?token=" + encodeURIComponent(inviteToken),
        );
        return inviteScreen();
      } catch (e) {
        invitationError = e.message;
      }
    }
    await refresh();
  } catch (err) {
    if (err.message === "Please sign in") login();
    else {
      $("#app").innerHTML = empty(
        "Unable to connect",
        "Please refresh the page to try again.",
      );
    }
  }
})();

function inviteScreen() {
  $("#app").innerHTML =
    `<div class="invitation-page"><a class="brand" href="/"><img src="/icon.svg" alt=""><span>cadre<span class="brand-light">&</span>leader</span></a><section class="card padded invitation-card"><p class="eyebrow">YOU’RE INVITED</p><h1>Good things start with people.</h1><p>You’ve been invited to <strong>${esc(invitation.team)}</strong>. Join voluntarily to see team updates, events and assigned work. You may leave at any time.</p><div class="info-note">Your display name is visible to team members. Contributions are private by default, with access for authorized reviewers. This invitation grants membership, not leadership authority.</div><form id="invite-form">${field("Display name", "name")}${field("Email", "email", "email")}${field("Choose a password (14–128 characters)", "password", "password")}<label class="checkbox"><input type="checkbox" name="consent" required> I want to join this private team.</label><p class="form-error" role="alert"></p><button class="button primary wide">Join my community →</button></form><p class="fine">Pilot software. Contact verification and account recovery are not yet available. Do not use it for sensitive live membership data.</p></section></div>`;
}
