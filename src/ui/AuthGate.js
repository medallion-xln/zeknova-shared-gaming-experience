const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const AUTH_WIDGET_SRC = "/cdn/medallion-auth.js?v=auth45";

function localDemoEnabled() {
  return location.protocol === "file:" || (
    LOCAL_HOSTS.has(location.hostname)
    && new URLSearchParams(location.search).get("demo") === "1"
  );
}

function authContext() {
  return globalThis.ZekNovaAuth?.context ?? {
    mode: localDemoEnabled() ? "demo" : "medallion",
    available: false,
    authenticated: false,
    enrolled: false,
    loginUrl: "/",
  };
}

let widgetPromise = null;
function loadAuthWidget() {
  if (globalThis.MedallionAuth) return Promise.resolve(globalThis.MedallionAuth);
  if (widgetPromise) return widgetPromise;
  widgetPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = AUTH_WIDGET_SRC;
    script.async = true;
    script.onload = () => globalThis.MedallionAuth
      ? resolve(globalThis.MedallionAuth)
      : reject(new Error("Auth widget loaded but did not initialize."));
    script.onerror = () => reject(new Error("Auth widget failed to load."));
    document.head.appendChild(script);
  }).catch((error) => {
    widgetPromise = null;
    throw error;
  });
  return widgetPromise;
}

function openSignInModal(fallbackUrl) {
  loadAuthWidget()
    .then((MedallionAuth) => MedallionAuth.open({ onSuccess: () => location.reload() }))
    .catch(() => { location.href = fallbackUrl || "/"; });
}

function renderProductionGate(panel, auth) {
  const available = auth.available !== false;
  panel.classList.add("auth-gate");
  panel.dataset.authPolished = available ? "sign-in" : "offline";
  panel.innerHTML = `
    <div class="panel-kicker"></div>
    <h3></h3>
    <p class="auth-gate-copy"></p>
    <div class="auth-gate-status"><span></span><strong></strong></div>
    <a class="primary-cta auth-login-cta">SIGN IN THROUGH MEDALLION XLN</a>
    <button class="primary-cta auth-retry" type="button">RETRY CONNECTION</button>
    <p class="auth-note"></p>
    <div class="form-error" role="alert"></div>
  `;

  panel.querySelector(".panel-kicker").textContent = available
    ? "MEDALLION XLN ACCOUNT REQUIRED"
    : "AUTHENTICATION SERVICE OFFLINE";
  panel.querySelector("h3").textContent = available
    ? "Sign in before deployment"
    : "Mission control is unavailable";
  panel.querySelector(".auth-gate-copy").textContent = available
    ? "ZekNova uses your Medallion XLN account. Sign in right here — no second password, no leaving the game."
    : "The production login service could not be reached. Your game session was not opened.";
  panel.querySelector(".auth-gate-status strong").textContent = available
    ? "SECURE ACCOUNT CONNECTION"
    : "CONNECTION REQUIRED";

  const signIn = panel.querySelector(".auth-login-cta");
  const retry = panel.querySelector(".auth-retry");
  if (available) {
    signIn.href = auth.loginUrl || "/";
    signIn.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
      event.preventDefault();
      openSignInModal(auth.loginUrl || "/");
    });
    retry.hidden = true;
    panel.querySelector(".auth-note").textContent = "A 6-digit code goes to your email. Verify it and you return to this screen signed in.";
  } else {
    signIn.hidden = true;
    retry.addEventListener("click", () => location.reload());
    panel.querySelector(".form-error").textContent = auth.error || "Authentication service unavailable.";
  }
}

function teamPickerMarkup() {
  return `
    <section class="team-picker" aria-labelledby="team-picker-title">
      <div id="team-picker-title" class="team-picker-title">Choose your crew</div>
      <div class="team-mode-switch" role="group" aria-label="Team enrollment mode">
        <button type="button" data-team-mode="create">Create a new team</button>
        <button type="button" data-team-mode="join">Join an existing team</button>
      </div>
      <div class="team-create-panel">
        <label>New team name<input id="new-team-name" autocomplete="organization" maxlength="80" placeholder="Terraformers" /></label>
      </div>
      <div class="team-join-panel" hidden>
        <label>Existing team<select id="existing-team"><option value="">Loading teams…</option></select></label>
        <p class="team-picker-help"></p>
      </div>
      <input type="hidden" name="teamName" value="" />
      <input type="hidden" name="teamCode" value="" />
    </section>
  `;
}

async function setupTeamPicker(form, enrollment, isLocal) {
  if (form.querySelector(".team-picker")) return;
  const oldTeamRow = form.querySelector('input[name="teamName"]')?.closest(".form-row");
  const container = document.createElement("div");
  container.innerHTML = teamPickerMarkup();
  const picker = container.firstElementChild;
  oldTeamRow?.replaceWith(picker);
  form.querySelector("fieldset")?.remove();

  const createButton = picker.querySelector('[data-team-mode="create"]');
  const joinButton = picker.querySelector('[data-team-mode="join"]');
  const createPanel = picker.querySelector(".team-create-panel");
  const joinPanel = picker.querySelector(".team-join-panel");
  const newName = picker.querySelector("#new-team-name");
  const select = picker.querySelector("#existing-team");
  const help = picker.querySelector(".team-picker-help");
  const teamName = picker.querySelector('input[name="teamName"]');
  const teamCode = picker.querySelector('input[name="teamCode"]');
  const submit = form.querySelector('button[type="submit"]');
  let mode = enrollment.teamCode ? "join" : "create";
  teamName.value = enrollment.teamName || "";
  teamCode.value = enrollment.teamCode || "";
  if (submit) submit.disabled = true;

  const sync = () => {
    const joining = mode === "join";
    createButton.classList.toggle("selected", !joining);
    joinButton.classList.toggle("selected", joining);
    createPanel.hidden = joining;
    joinPanel.hidden = !joining;
    if (joining) {
      const option = select.selectedOptions[0];
      teamCode.value = select.value;
      teamName.value = option?.dataset.teamName || "";
    } else {
      teamCode.value = "";
      teamName.value = newName.value.trim();
    }
  };

  createButton.addEventListener("click", () => { mode = "create"; sync(); newName.focus(); });
  joinButton.addEventListener("click", () => { mode = "join"; sync(); select.focus(); });
  newName.addEventListener("input", sync);
  select.addEventListener("change", sync);
  newName.value = mode === "create" ? (enrollment.teamName || "") : "";

  let teams = [];
  if (!isLocal) {
    try {
      const response = await fetch("./api/teams.php", { credentials: "include", headers: { Accept: "application/json" } });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.teams)) teams = payload.teams;
    } catch {}
  } else if (enrollment.teamCode) {
    teams = [{ id: enrollment.teamCode, name: enrollment.teamName, members: 1 }];
  }

  select.innerHTML = "";
  if (teams.length === 0) {
    const option = new Option("No existing teams yet", "");
    select.add(option);
    joinButton.disabled = true;
    mode = "create";
    help.textContent = "Create the first team for this shared world.";
  } else {
    for (const team of teams) {
      const option = new Option(`${team.name} · ${team.members} member${team.members === 1 ? "" : "s"}`, team.id);
      option.dataset.teamName = team.name;
      select.add(option);
    }
    const currentIndex = teams.findIndex((team) => team.id === enrollment.teamCode);
    select.selectedIndex = currentIndex >= 0 ? currentIndex : 0;
    help.textContent = "Joining a team connects you to its persistent colony and active crew.";
  }
  sync();
  if (submit) submit.disabled = false;
}

function polishEnrollment(panel, auth, isLocal) {
  const key = isLocal ? "local" : `connected-${auth.signedOut ? "resume" : "active"}`;
  if (panel.dataset.authPolished === key) return;
  panel.dataset.authPolished = key;
  panel.classList.remove("auth-gate");

  const form = panel.querySelector("#crew-form");
  if (!form) return;

  const identity = auth.identity ?? {};
  const enrollment = auth.enrollment ?? {};
  const kicker = panel.querySelector(".panel-kicker");
  const heading = panel.querySelector("h3");
  const note = panel.querySelector(".auth-note");
  const email = form.elements.namedItem("email");

  if (kicker) kicker.textContent = isLocal
    ? "LOCAL DEVELOPMENT MODE"
    : auth.enrolled ? "CREW PROFILE" : "ZEKNOVA ENLISTMENT";
  if (heading && !auth.enrolled) heading.textContent = "Complete your deployment profile";

  for (const name of ["displayName"]) {
    const input = form.elements.namedItem(name);
    const value = enrollment[name] || (name === "displayName" ? identity.displayName : "");
    if (input instanceof HTMLInputElement && !input.value && value) input.value = value;
  }

  if (email instanceof HTMLInputElement && !isLocal) {
    email.closest("label")?.remove();
  }

  if (!form.querySelector(".auth-connection-badge")) {
    const badge = document.createElement("div");
    badge.className = "auth-connection-badge";
    badge.innerHTML = "<span></span><strong></strong>";
    badge.querySelector("strong").textContent = isLocal
      ? "LOCAL-ONLY PROFILE"
      : "CONNECTED TO MEDALLION XLN";
    form.prepend(badge);
  }

  setupTeamPicker(form, enrollment, isLocal);

  if (note) note.textContent = isLocal
    ? "Local test mode stores this officer in your browser. Production always requires Medallion XLN."
    : "Your Medallion identity is verified; ZekNova stores only game enrollment and progression.";
}

function applyGate(root) {
  const landingDescription = root.querySelector(".landing-copy p");
  if (landingDescription) {
    landingDescription.textContent = "Humanity arrives in ten days. Form or join a team, explore all five regions, and build a shared civilization on ZekNova.";
  }
  const panel = root.querySelector(".landing-shell .login-panel");
  if (!panel) return;
  const auth = authContext();
  const isLocal = localDemoEnabled();
  if (!isLocal && (!auth.authenticated || auth.available === false)) {
    const targetState = auth.available === false ? "offline" : "sign-in";
    if (panel.dataset.authPolished !== targetState) renderProductionGate(panel, auth);
    return;
  }
  polishEnrollment(panel, auth, isLocal);
}

export function installAuthGate(root = document.getElementById("app")) {
  if (!root) return () => {};
  applyGate(root);
  const observer = new MutationObserver(() => queueMicrotask(() => applyGate(root)));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
