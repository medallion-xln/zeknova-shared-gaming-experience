const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const AUTH_WIDGET_SRC = "/cdn/medallion-auth.js?v=auth46";
const LOCAL_USER_KEY = "zeknova.user.v1";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

function localDemoEnabled() {
  return location.protocol === "file:" || (
    LOCAL_HOSTS.has(location.hostname)
    && new URLSearchParams(location.search).get("demo") === "1"
  );
}

let widgetPromise;
function loadAuthWidget() {
  if (globalThis.MedallionAuth) return Promise.resolve(globalThis.MedallionAuth);
  if (widgetPromise) return widgetPromise;
  widgetPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = AUTH_WIDGET_SRC;
    script.async = true;
    script.onload = () => globalThis.MedallionAuth
      ? resolve(globalThis.MedallionAuth)
      : reject(new Error("Authentication widget did not initialize."));
    script.onerror = () => reject(new Error("Authentication widget is unavailable."));
    document.head.appendChild(script);
  }).catch((error) => {
    widgetPromise = null;
    throw error;
  });
  return widgetPromise;
}

function pageShell(content) {
  return `
    <main class="login-boot-shell">
      <div class="login-boot-backdrop"></div>
      <section class="login-boot-brand">
        <div class="login-boot-eyebrow">AI × CRYPTO EXPO 2026 · MISSION 2</div>
        <h1>ZEKNOVA</h1>
        <h2>Prepare the Planet</h2>
        <p>Form or join a team, explore five regions, and build one persistent civilization together.</p>
        <div class="login-boot-sequence"><span>AUTHENTICATE</span><i></i><span>ENLIST</span><i></i><span>LAUNCH</span></div>
      </section>
      <section class="login-boot-panel">${content}</section>
    </main>
  `;
}

async function sessionState() {
  const response = await fetch("./api/session.php", { credentials: "include", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Authentication service unavailable.");
  return payload;
}

async function postEnrollment(payload) {
  const response = await fetch("./api/session.php", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...payload, biome: "highlands", officerClass: "ensign" }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to complete team enrollment.");
  if (!result.user) throw new Error("The server did not return an active officer profile.");
  return result.user;
}

async function fetchTeams() {
  const response = await fetch("./api/teams.php", { credentials: "include", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  return response.ok && Array.isArray(payload.teams) ? payload.teams : [];
}

function renderSignIn(root, auth) {
  const loginUrl = auth.loginUrl || "/auth/login/";
  const registerUrl = auth.registerUrl || "/auth/register";
  root.innerHTML = pageShell(`
    <div class="login-boot-kicker">MEDALLION XLN IDENTITY</div>
    <h3>Sign in or create an account</h3>
    <p class="login-boot-copy">Create a free account if this is your first deployment. Returning players can sign in with a six-digit email code.</p>
    <div class="login-boot-status"><span></span><strong>LIGHTWEIGHT SECURE LOGIN</strong></div>
    <a id="medallion-sign-in" class="login-boot-primary" href="${escapeHtml(loginUrl)}">SIGN IN WITH EMAIL CODE</a>
    <a id="medallion-create-account" class="login-boot-secondary" href="${escapeHtml(registerUrl)}">CREATE A FREE ACCOUNT</a>
    <ol class="login-account-steps">
      <li><strong>New player?</strong> Create and verify your Medallion XLN account.</li>
      <li><strong>Then return here</strong> and sign in with the same email.</li>
      <li><strong>Choose a crew</strong> and launch the shared ZekNova world.</li>
    </ol>
    <p class="login-boot-note">No password is stored by ZekNova. Authentication remains with Medallion XLN.</p>
    <div id="login-boot-error" class="login-boot-error" role="alert"></div>
  `);
  root.querySelector("#medallion-sign-in")?.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
    event.preventDefault();
    const error = root.querySelector("#login-boot-error");
    loadAuthWidget()
      .then((MedallionAuth) => MedallionAuth.open({ onSuccess: () => location.reload() }))
      .catch(() => { location.href = loginUrl; });
    if (error) error.textContent = "";
  });
}

function renderUnavailable(root, message) {
  root.innerHTML = pageShell(`
    <div class="login-boot-kicker">MISSION CONTROL OFFLINE</div>
    <h3>Login service unavailable</h3>
    <p class="login-boot-copy">The game has not been loaded. Reconnect to authentication before launching.</p>
    <button id="login-retry" class="login-boot-primary" type="button">RETRY CONNECTION</button>
    <div class="login-boot-error" role="alert">${escapeHtml(message)}</div>
  `);
  root.querySelector("#login-retry")?.addEventListener("click", () => location.reload());
}

function renderReady(root, user, launch, options = {}) {
  root.innerHTML = pageShell(`
    <div class="login-boot-kicker">CREW CLEARED FOR LAUNCH</div>
    <h3>Welcome, ${escapeHtml(user.displayName || "Crew Member")}</h3>
    <div class="login-boot-profile">
      <span>TEAM</span><strong>${escapeHtml(user.teamName || "Unassigned")}</strong>
      <span>RANK</span><strong>${escapeHtml(user.officerClass || "ensign").toUpperCase()}</strong>
    </div>
    <p class="login-boot-copy">The game is still unloaded. Launch when you are ready to initialize the shared world.</p>
    <button id="launch-game" class="login-boot-primary" type="button">LAUNCH ZEKNOVA</button>
    <button id="change-team" class="login-boot-secondary" type="button">CHANGE TEAM</button>
    <div id="login-boot-error" class="login-boot-error" role="alert"></div>
  `);
  root.querySelector("#change-team")?.addEventListener("click", options.changeTeam ?? (() => {}));
  root.querySelector("#launch-game")?.addEventListener("click", async () => {
    const button = root.querySelector("#launch-game");
    const error = root.querySelector("#login-boot-error");
    button.disabled = true;
    button.textContent = "PREPARING GAME…";
    try {
      const activeUser = options.activate ? await options.activate() : user;
      root.innerHTML = pageShell('<div class="login-boot-loader"><span></span><h3>Loading ZekNova</h3><p>Initializing terrain, models, simulation, and multiplayer…</p></div>');
      launch(activeUser);
    } catch (failure) {
      if (error) error.textContent = failure instanceof Error ? failure.message : "Unable to launch.";
      button.disabled = false;
      button.textContent = "LAUNCH ZEKNOVA";
    }
  });
}

async function renderEnrollment(root, session, launch, isLocal = false, persistLocalSession = false) {
  const auth = session.auth ?? {};
  const identity = auth.identity ?? {};
  const enrollment = auth.enrollment ?? {};
  const teams = isLocal ? [] : await fetchTeams();
  root.innerHTML = pageShell(`
    <div class="login-boot-kicker">${isLocal ? "LOCAL DEVELOPMENT" : "ZEKNOVA ENLISTMENT"}</div>
    <h3>Choose your team</h3>
    <form id="login-enrollment-form">
      <label>Callsign<input name="displayName" required maxlength="80" value="${escapeHtml(enrollment.displayName || identity.displayName || "")}" placeholder="Commander Nova" /></label>
      ${isLocal ? `<label>Email<input name="email" type="email" required value="${escapeHtml(identity.email || "")}" placeholder="you@company.com" /></label>` : ""}
      <div class="login-team-switch">
        <button type="button" class="selected" data-team-mode="create">Create a new team</button>
        <button type="button" data-team-mode="join" ${teams.length ? "" : "disabled"}>Join an existing team</button>
      </div>
      <div data-team-panel="create"><label>New team name<input id="login-new-team" maxlength="80" placeholder="Terraformers" /></label></div>
      <div data-team-panel="join" hidden><label>Existing team<select id="login-existing-team">${teams.map((team) => `<option value="${escapeHtml(team.id)}" data-name="${escapeHtml(team.name)}">${escapeHtml(team.name)} · ${Number(team.members)} member${Number(team.members) === 1 ? "" : "s"}</option>`).join("")}</select></label></div>
      <input type="hidden" name="teamName" /><input type="hidden" name="teamCode" />
      <button class="login-boot-primary" type="submit">COMPLETE ENLISTMENT</button>
      <div id="login-boot-error" class="login-boot-error" role="alert"></div>
    </form>
  `);

  const form = root.querySelector("#login-enrollment-form");
  const create = root.querySelector('[data-team-mode="create"]');
  const join = root.querySelector('[data-team-mode="join"]');
  const newTeam = root.querySelector("#login-new-team");
  const existing = root.querySelector("#login-existing-team");
  const hiddenName = form.elements.namedItem("teamName");
  const hiddenCode = form.elements.namedItem("teamCode");
  let mode = "create";
  const sync = () => {
    const joining = mode === "join";
    create.classList.toggle("selected", !joining);
    join.classList.toggle("selected", joining);
    root.querySelector('[data-team-panel="create"]').hidden = joining;
    root.querySelector('[data-team-panel="join"]').hidden = !joining;
    hiddenCode.value = joining ? (existing?.value || "") : "";
    hiddenName.value = joining ? (existing?.selectedOptions[0]?.dataset.name || "") : newTeam.value.trim();
  };
  create.addEventListener("click", () => { mode = "create"; sync(); newTeam.focus(); });
  join.addEventListener("click", () => { mode = "join"; sync(); existing.focus(); });
  newTeam.addEventListener("input", sync);
  existing?.addEventListener("change", sync);
  sync();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const error = root.querySelector("#login-boot-error");
    const data = new FormData(form);
    submit.disabled = true;
    submit.textContent = "ENLISTING…";
    if (error) error.textContent = "";
    try {
      let user;
      if (isLocal) {
        const email = String(data.get("email") || "").trim().toLowerCase();
        const displayName = String(data.get("displayName") || "").trim();
        const teamName = String(data.get("teamName") || "").trim();
        if (!email || !displayName || !teamName) throw new Error("Callsign, email, and team name are required.");
        if (persistLocalSession) {
          user = await postEnrollment({ email, displayName, teamName, teamCode: String(data.get("teamCode") || "") });
        } else {
          user = { id: `demo-${Date.now()}`, displayName, email, teamName, teamCode: `LOCAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, officerClass: "ensign", biome: "highlands", rankXp: 0 };
          localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
        }
      } else {
        user = await postEnrollment({
          displayName: String(data.get("displayName") || ""),
          teamName: String(data.get("teamName") || ""),
          teamCode: String(data.get("teamCode") || ""),
        });
      }
      renderReady(root, user, launch, { changeTeam: () => renderEnrollment(root, { ...session, user, auth: { ...auth, enrolled: true, enrollment: user } }, launch, isLocal, persistLocalSession) });
    } catch (failure) {
      if (error) error.textContent = failure instanceof Error ? failure.message : "Unable to complete enrollment.";
      submit.disabled = false;
      submit.textContent = "COMPLETE ENLISTMENT";
    }
  });
}

export function runLoginPage(root = document.getElementById("app")) {
  return new Promise(async (resolve) => {
    const launch = (user) => resolve({ user });
    if (!root) return resolve({ user: null });
    if (localDemoEnabled()) {
      let user = null;
      try { user = JSON.parse(localStorage.getItem(LOCAL_USER_KEY) || "null"); } catch {}
      if (user) renderReady(root, user, launch, { changeTeam: () => renderEnrollment(root, { auth: { identity: user, enrollment: user } }, launch, true) });
      else await renderEnrollment(root, { auth: { identity: {}, enrollment: {} } }, launch, true);
      return;
    }
    try {
      const session = await sessionState();
      const auth = session.auth ?? {};
      const serverLocal = session.environment === "local" || auth.environment === "local" || auth.mode === "demo";
      if (serverLocal) {
        if (session.user) return renderReady(root, session.user, launch, {
          changeTeam: () => renderEnrollment(root, session, launch, true, true),
        });
        return renderEnrollment(root, session, launch, true, true);
      }
      if (!auth.authenticated) return renderSignIn(root, auth);
      if (session.user) return renderReady(root, session.user, launch, { changeTeam: () => renderEnrollment(root, session, launch) });
      if (auth.enrolled && auth.enrollment) {
        const profile = { ...auth.enrollment, email: auth.identity?.email || "", officerClass: "ensign" };
        return renderReady(root, profile, launch, {
          activate: () => postEnrollment(profile),
          changeTeam: () => renderEnrollment(root, session, launch),
        });
      }
      await renderEnrollment(root, session, launch);
    } catch (error) {
      renderUnavailable(root, error instanceof Error ? error.message : "Authentication service unavailable.");
    }
  });
}
