const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function isLegacySessionRestore(input, init = {}) {
  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") return false;
  const source = input instanceof Request ? input.url : String(input);
  try { return new URL(source, location.href).pathname.endsWith("/api/session.php"); }
  catch { return false; }
}

async function importRuntimeWithSession(runtimeUrl, user) {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (!isLegacySessionRestore(input, init)) return nativeFetch(input, init);
    const auth = {
      available: true,
      authenticated: true,
      enrolled: true,
      signedOut: false,
      identity: { displayName: user.displayName || "", email: user.email || "" },
      enrollment: user,
      loginUrl: "/auth/login/",
      registerUrl: "/auth/register",
    };
    return Promise.resolve(new Response(JSON.stringify({ user, auth }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  };
  try { await import(runtimeUrl); }
  finally { globalThis.fetch = nativeFetch; }
}

function diagnosticUrl(flag) {
  const url = new URL(location.href);
  url.searchParams.set(flag, "1");
  return url.href;
}

function createStartupCover() {
  document.getElementById("zeknova-startup-cover")?.remove();
  const cover = document.createElement("section");
  cover.id = "zeknova-startup-cover";
  cover.className = "zeknova-startup-cover";
  cover.innerHTML = `
    <div class="zeknova-startup-card" role="status" aria-live="polite">
      <span class="zeknova-startup-orbit" aria-hidden="true"></span>
      <small>ZEKNOVA DEPLOYMENT</small>
      <h1>Preparing your world</h1>
      <p data-startup-detail>Loading the browser engine…</p>
      <div class="zeknova-startup-meter"><i></i></div>
      <details>
        <summary>Launch diagnostics</summary>
        <p>If this device stalls, test the lightweight world. WebAssembly is now optional and disabled by default.</p>
        <div>
          <a href="${diagnosticUrl("safe")}">Launch lightweight world</a>
          <a href="${diagnosticUrl("wasm")}">Test with WebAssembly</a>
        </div>
      </details>
    </div>`;
  document.body.append(cover);
  const detail = cover.querySelector("[data-startup-detail]");
  const update = (event) => {
    if (detail && event.detail?.detail) detail.textContent = event.detail.detail;
    cover.dataset.stage = event.detail?.stage || "loading";
  };
  window.addEventListener("zeknova:startup-stage", update);
  return {
    set(message, stage = "loading") { if (detail) detail.textContent = message; cover.dataset.stage = stage; },
    finish(diagnostics) {
      window.removeEventListener("zeknova:startup-stage", update);
      cover.dataset.stage = "ready";
      if (detail) detail.textContent = `Deployment ready in ${(Number(diagnostics?.elapsedMs || 0) / 1000).toFixed(1)} seconds`;
      window.setTimeout(() => cover.remove(), 350);
    },
    fail(message) {
      cover.dataset.stage = "error";
      if (detail) detail.textContent = message;
      window.removeEventListener("zeknova:startup-stage", update);
    },
  };
}

export class Game {
  constructor({ runtime = "../../assets/index-02987539.js?v=utilityfix1" } = {}) {
    this.runtimeUrl = new URL(runtime, import.meta.url);
    this.started = false;
  }

  async start({ user } = {}) {
    if (this.started) return;
    if (!user) throw new Error("An authenticated officer is required to start the game runtime.");
    const startup = createStartupCover();
    const ready = new Promise((resolve) => window.addEventListener("zeknova:gameplay-ready", (event) => resolve(event.detail), { once: true }));
    try {
      startup.set("Loading the game engine…", "engine");
      await nextPaint();
      await importRuntimeWithSession(this.runtimeUrl.href, user);
      const bridge = globalThis.ZekNovaLegacyBridge;
      if (!bridge?.start) throw new Error("The direct game-runtime bridge is unavailable.");
      startup.set("Building terrain, vegetation, and collision maps…", "world");
      await nextPaint();
      await bridge.start(user);
      const diagnostics = await ready;
      startup.finish(diagnostics);
      this.started = true;
      window.dispatchEvent(new CustomEvent("zeknova:ready", { detail: { sourceEntry: import.meta.url, runtime: this.runtimeUrl.href } }));
    } catch (error) {
      startup.fail(error instanceof Error ? error.message : "Deployment could not start.");
      throw error;
    }
  }
}
