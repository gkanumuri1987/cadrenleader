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
let state,
  page = location.hash.slice(1) || "home",
  filter = "all",
  config = { demo: false },
  invitation = null,
  invitationError = "";
const inviteToken = new URLSearchParams(location.search).get("invite");
const unit = () => state?.units[0];
const initials = (name) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
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
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
async function refresh() {
  state = await api("state");
  render();
}
function navigate(next) {
  page = next;
  filter = "all";
  location.hash = next;
  render();
  $("#main")?.focus();
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
    `<div class="login"><div class="login-story"><a class="brand" href="/"><img src="/icon.svg" alt=""><span>cadre<span class="brand-light">&</span>leader</span></a><div><p class="eyebrow">PEOPLE. PURPOSE. PROGRESS.</p><h1>Great things happen<br>when we show up.<span> Together.</span></h1><p>A place to connect with your community, do meaningful work, and keep a record of the difference you make.</p><div class="login-art" aria-hidden="true"><div class="art-ring"></div><span class="art-leaf">✳</span><span class="art-circle">↗</span><div class="art-card">Small actions.<br><strong>Lasting impact.</strong></div></div></div><small>Built around people. Rooted in trust.</small></div><div class="login-form"><div class="login-inner"><span class="pill">YOUR COMMUNITY WORKSPACE</span><h2>Welcome to your next chapter.</h2><p>Sign in to pick up where your team left off.</p><form id="login-form"><label>Email address<input name="email" type="email" autocomplete="username" placeholder="you@example.com" required></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label><p class="form-error" role="alert"></p><button class="button primary wide">Sign in <span>→</span></button></form>${config.demo ? `<div class="demo-panel"><strong>Explore the working demo</strong><p>Synthetic people and sample events. Changes persist in this demo database.</p><button class="button secondary wide" data-action="login-member">Explore as a member →</button><button class="text-button" data-action="login-leader">Open leader workspace</button></div>` : '<p class="fine">Need access? Contact your organization administrator. Public registration and password recovery are not yet available.</p>'}${invitationError ? '<p class="form-error">' + esc(invitationError) + "</p>" : ""}<p class="fine">Your membership is voluntary. Your contributions are yours.</p></div></div></div>`;
}
function render() {
  if (!state) return login();
  if (!labels[page] || (page === "review" && !unit()?.isLeader)) page = "home";
  const u = unit();
  const count = pending().length;
  $("#app").innerHTML =
    `<div class="app-layout"><aside class="sidebar"><a class="brand" href="#home" data-nav="home"><img src="/icon.svg" alt=""><span>cadre<span class="brand-light">&</span>leader</span></a><div class="workspace-label">YOUR WORKSPACE</div><div class="team-switch"><span class="team-icon">VC</span><div><strong>${esc(u?.name || "Personal workspace")}</strong><small>${u?.isLeader ? "Leader workspace" : "Member workspace"}</small></div></div><nav aria-label="Main navigation">${Object.entries(
      labels,
    )
      .filter(([key]) => key !== "review" || u?.isLeader)
      .map(
        ([key, label]) =>
          `<a href="#${key}" data-nav="${key}" class="nav-item ${page === key ? "active" : ""}" ${page === key ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icons[key]}</span>${label}${key === "review" && count ? `<b>${count}</b>` : ""}</a>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><div class="purpose-note"><span>✳</span><strong>A little effort.<br>A bigger difference.</strong><p>Every contribution has a story. Make yours count.</p></div><button class="user-card" data-action="profile"><span class="avatar">${initials(state.user.name)}</span><span><strong>${esc(state.user.name)}</strong><small>Account & privacy</small></span><span>⌄</span></button><button class="text-button logout" data-action="logout">Sign out</button></div></aside><div class="main-wrap"><header class="topbar"><span>Workspace <span class="crumb">/</span> <strong>${labels[page]}</strong></span><div class="topbar-right">${state.demo ? '<span class="demo-label">DEMO WORKSPACE</span>' : ""}<span class="privacy-tag">◈ Private team</span><button class="avatar small account-button" aria-label="Account and privacy" data-action="profile">${initials(state.user.name)}</button></div></header><nav class="mobile-nav" aria-label="Mobile navigation">${["home", "events", "work", "journey", "community", ...(u?.isLeader ? ["review"] : [])].map((k) => `<a href="#${k}" data-nav="${k}" class="${k === page ? "active" : ""}"><span>${icons[k]}</span>${k === "home" ? "Home" : k === "community" ? "Team" : k === "review" ? "Review" : labels[k].replace("My ", "")}</a>`).join("")}</nav><main id="main" tabindex="-1">${{ home: home, events: events, work: work, journey: journey, community: community, review: review }[page]()}</main><footer>Made for meaningful participation.<span>Membership is always your choice.</span></footer></div></div>`;
}
function heading(kicker, title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function eventCard(e, compact = false) {
  return `<article class="event-card ${compact ? "compact" : ""}"><div class="event-visual ${e.id === "team-circle" ? "blue" : ""}"><div class="date-tile"><strong>${new Date(e.date).getDate()}</strong><span>${date(e.date, { month: "short" }).toUpperCase()}</span></div><span class="event-art" aria-hidden="true">${e.id === "team-circle" ? "◌" : "✳"}</span><span class="event-kind">${e.permit === "pending" ? "PRELIMINARY · PERMIT PENDING" : "COMMUNITY"}</span></div><div class="event-content"><div class="event-meta">${esc(date(e.date, { weekday: "short", month: "short", day: "numeric" }))} <span>·</span> ${new Date(e.date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div><h3><button class="title-button" data-action="event" data-id="${e.id}">${esc(e.title)}</button></h3><p class="venue">⌖ ${esc(e.venue)}</p><div class="event-bottom"><span><span class="tiny-avatar">${e.attending ? "✓" : "♙"}</span> ${e.attending} / ${e.capacity} attending</span><button class="${e.going ? "going" : "rsvp-button"}" data-action="rsvp" data-id="${e.id}">${e.going ? "✓ Going" : "RSVP ↗"}</button></div></div></article>`;
}
function taskRow(t) {
  const c = state.contributions.find((c) => c.task === t.id);
  return `<div class="task-row"><span class="task-check ${t.status === "verified" ? "complete" : ""}">${t.status === "verified" ? "✓" : "○"}</span><div><strong>${esc(t.title)}</strong><small>${esc(t.eventTitle || "Community contribution")} ${unit()?.isLeader ? " · " + esc(t.assigneeName) : ""}</small></div><div class="task-right">${t.status === "open" ? `<span class="due">Due ${date(t.due)}</span>${t.assignee === state.user.id ? `<button class="text-button" data-action="submit" data-id="${t.id}">${c?.status === "returned" ? "Resubmit" : "Submit work"} →</button>` : ""}` : badge(t.status)}</div></div>`;
}
function home() {
  const tasks = mine().filter((t) => t.status === "open"),
    upcoming = state.events.filter(
      (e) => !["closed", "cancelled", "completed"].includes(e.status),
    ),
    verified = state.contributions.filter(
      (c) => c.user === state.user.id && c.status === "verified",
    );
  return `${heading("LET’S MAKE TODAY MATTER", `Good to see you, ${esc(state.user.name.split(" ")[0])}.`, "Your community is moving forward. Here’s where you come in.", unit()?.isLeader ? button("+ Create event", "create-event", "primary") : button("Explore events ↗", "events", "secondary"))}<section class="hero"><div><span class="hero-label">CONNECTED BY PURPOSE</span><h2>Your time. Your effort.<br><em>A stronger community.</em></h2><p>Show up for what matters. Find your next opportunity<br class="desktop-only"> to make a difference, with people who care.</p><button class="button light" data-nav="events">Find your next event <span>↗</span></button></div><div class="hero-art" aria-hidden="true"><div class="orbit one"></div><div class="orbit two"></div><span class="hero-sun">✳</span><div class="hero-ticket"><span>↗</span><strong>Better,<br>together.</strong><small>ONE CONTRIBUTION AT A TIME</small></div><div class="hero-dot"></div></div></section><section class="stats" aria-label="Your activity"><div><span class="stat-icon orange">▦</span><div><strong>${upcoming.length.toString().padStart(2, "0")}</strong><span>Upcoming events</span></div></div><div><span class="stat-icon green">✓</span><div><strong>${tasks.length.toString().padStart(2, "0")}</strong><span>Tasks to take forward</span></div></div><div><span class="stat-icon purple">♧</span><div><strong>${verified.length.toString().padStart(2, "0")}</strong><span>Verified contributions</span></div></div></section><div class="dashboard-grid"><div><section><div class="section-title"><div><h2>Coming up in your community</h2><p>Good things to be a part of.</p></div><button class="text-button" data-nav="events">All events ↗</button></div><div class="event-grid">${
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
function events() {
  let list = state.events.filter(
    (e) =>
      filter === "all" ||
      (filter === "going"
        ? e.going
        : !["closed", "completed", "cancelled"].includes(e.status)),
  );
  return `${heading("MAKE A LITTLE ROOM FOR IMPACT", "Meet up. Show up. Make a difference.", "Discover what’s happening and choose how you’d like to take part.", unit()?.isLeader ? button("+ Create event", "create-event", "primary") : "")}<div class="toolbar"><div class="tabs" aria-label="Event filters">${[
    ["all", "All events"],
    ["upcoming", "Upcoming"],
    ["going", "I’m going"],
  ]
    .map(
      ([key, label]) =>
        `<button class="${filter === key ? "selected" : ""}" data-filter="${key}">${label}</button>`,
    )
    .join(
      "",
    )}</div><span class="muted">${list.length} events</span></div><div class="event-grid full">${list.map((e) => eventCard(e)).join("") || empty("No events here yet", "Try another filter or wait for your team’s next event.")}</div>`;
}
function work() {
  return `${heading("SMALL STEPS. REAL PROGRESS.", unit()?.isLeader ? "Keep good work moving." : "Your next contribution starts here.", "Complete your task, describe the outcome, and submit it for a fair review.", unit()?.isLeader ? button("+ Assign task", "create-task", "primary") : "")}<div class="toolbar"><div class="tabs">${[
    ["all", "All work"],
    ["open", "To do"],
    ["submitted", "In review"],
    ["verified", "Verified"],
  ]
    .map(
      ([k, l]) =>
        `<button data-filter="${k}" class="${filter === k ? "selected" : ""}">${l}</button>`,
    )
    .join("")}</div></div><div class="card">${
    state.tasks
      .filter((t) => filter === "all" || t.status === filter)
      .map(taskRow)
      .join("") ||
    empty("Nothing in this view", "Your assigned work will appear here.")
  }</div><div class="info-note">◈ A verified contribution records your work. It does not create a rating, promotion, or payment.</div>`;
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
  if (name === "event") {
    const e = state.events.find((e) => e.id === selectedId);
    const next = {
      published: "ready",
      ready: "active",
      active: "completed",
      completed: "closed",
    }[e.status];
    return modal(
      esc(e.title),
      `<p class="event-meta">${date(e.date, { weekday: "long", day: "numeric", month: "long" })} · ${new Date(e.date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</p><p>${esc(e.description)}</p><p>⌖ ${esc(e.venue)}</p><p>${e.attending} / ${e.capacity} attending · ${badge(e.status)}</p><div class="info-note">External permission: ${esc(e.permit.replaceAll("_", " "))}. ${e.permit === "pending" ? "This is a preliminary invitation. Readiness is blocked until a permit is verified." : ""}</div><div class="modal-actions"><button class="button primary" data-action="rsvp" data-id="${e.id}">${e.going ? "Withdraw RSVP" : "Count me in"}</button>${unit()?.isLeader && next ? `<button class="button secondary" data-action="event-status" data-id="${e.id}" data-status="${next}">Mark ${next}</button>` : ""}</div>`,
    );
  }
  if (name === "event-status") {
    await api(`events/${selectedId}/status`, { status: target.dataset.status });
    $("#modal").close();
    await refresh();
    return toast("Event updated");
  }
  if (name === "submit") {
    const t = state.tasks.find((t) => t.id === selectedId);
    return modal(
      "Share your contribution",
      `<p>${esc(t.title)}</p>${form(textarea("What did you do, and what was the outcome?", "summary"), "submit", "Submit for verification →")}<p class="fine">Include the work you completed and any relevant context. Your team leader will review it.</p>`,
    );
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
        `${field("Event title", "title")}${textarea("What will we do?", "description")}${field("Meeting place", "venue")}${field("Date and time (local)", "date", "datetime-local")}${field("Capacity", "capacity", "number")}<label class="checkbox"><input type="checkbox" name="requiresPermit"> This event needs an external permit</label><p class="fine">Permit tracking is manual. Events needing a permit cannot be marked ready in this release.</p>`,
        "create-event",
        "Publish event →",
      ),
    );
  if (name === "create-task")
    return modal(
      "Make the next step clear",
      form(
        `${field("Task title", "title")}<label>Assign to<select name="assignee">${state.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Related event<select name="event"><option value="">No event</option>${state.events.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join("")}</select></label>${field("Due date", "due", "date")}`,
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
  const t = e.target.closest("[data-action]");
  if (!t) return;
  t.disabled = true;
  try {
    await action(t.dataset.action, t);
    if (t.dataset.action === "rsvp" && $("#modal").open) $("#modal").close();
  } catch (err) {
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
      const routes = {
        submit: [
          "contributions",
          { task: selectedId, summary: values.summary },
        ],
        review: ["contributions/review", { id: selectedId, ...values }],
        "create-event": [
          "events",
          {
            ...values,
            unit: unit()?.id,
            date: new Date(values.date).toISOString(),
            capacity: Number(values.capacity),
            requiresPermit: values.requiresPermit === "on",
          },
        ],
        "create-task": ["tasks", { ...values, unit: unit()?.id }],
        "create-post": [
          "posts",
          { ...values, unit: unit()?.id, official: values.official === "true" },
        ],
        profile: ["profile", values],
        leave: ["leave", { unit: unit()?.id }],
      };
      const [route, body] = routes[type];
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
window.addEventListener("hashchange", () => {
  page = location.hash.slice(1) || "home";
  filter = "all";
  if (state) render();
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
