/**
 * Immersive Play Mode for ZekNova Studio.
 *
 * Entering Play hides the editor chrome, enters fullscreen (or a full-window
 * fallback), initializes the game camera director, requests pointer lock, and
 * paints a minimal HUD. Exiting restores the editor and resets the isolated
 * simulation WITHOUT mutating the authored scene.
 *
 * Custody: Play Mode never writes back to the authoring Scene. The simulation
 * is a fresh engine built from a serialize() snapshot; returning to the editor
 * disposes it. Camera motion is presentation-only.
 *
 * Rendering selector (Phase 4): a presentation-only selector surfaces the
 * renderer path (NATIVE / REFERENCE / NEURAL) without conferring any gameplay
 * authority. Frame content is sampled from the existing single-writer engine;
 * selecting NEURAL only requests the model *presentation* of already-authoritative
 * frames and requires a real backend (PresentationController.allowMock is false).
 */
const MODE_ORDER = ['isometric', 'over-shoulder', 'third-person'];

export function installPlayMode(deps) {
  const { state, viewport, ensureSimulation, reset, status, current, $, createCameraDirector, presentation, hasRealNeuralBackend = () => false } = deps;

  let director = null;
  let hud = null;
  let pointerTarget = null;
  let lookYaw = 0, lookPitch = 0;
  let active = false;
  let simFrameHook = null; // called each frame in play mode to sync camera before render

  const body = () => document.body;
  const root = () => $('#play-hud');

  function findFollowTarget() {
    const rules = state.engine?.exportProject?.().rules ?? [];
    const move = rules.find(r => r.kind === 'move');
    if (move && current().findEntity(move.entity)) return move.entity;
    for (const candidate of ['player', 'pilot']) if (current().findEntity(candidate)) return candidate;
    return null;
  }

  function hudText() {
    const scene = current();
    const target = findFollowTarget();
    const player = target ? scene.findEntity(target) : null;
    const objective = scene.findEntity('objective');
    let objectiveLine = 'Explore the world';
    if (objective?.components?.state?.complete) objectiveLine = '✓ Objective complete';
    else if (player?.components?.state) {
      const s = player.components.state;
      const bits = [];
      if (Number.isFinite(s.cells)) bits.push(`Cells ${s.cells}`);
      if (typeof s.built === 'boolean') bits.push(s.built ? 'Relay built' : 'Relay missing');
      if (bits.length) objectiveLine += ' · ' + bits.join(' · ');
    }
    return objectiveLine;
  }

  function cameraLabel() {
    return director ? director.mode : 'isometric';
  }

  function renderLabel() {
    // Accurate status label: only presentation, never claims inference.
    return presentation ? presentation.label() : (director ? 'NATIVE' : 'NATIVE');
  }

  function refreshHUD() {
    if (!hud) return;
    hud.querySelector('[data-hud-objective]').textContent = hudText();
    hud.querySelector('[data-hud-camera]').textContent = cameraLabel();
    const renderNode = hud.querySelector('[data-hud-render]');
    if (renderNode) {
      renderNode.textContent = renderLabel();
      reflectRenderSelector();
    }
  }

  // Reflect the selected renderer path back onto the selector buttons and the
  // status line, so the HUD never claims a mode that is not actually active.
  function reflectRenderSelector() {
    if (!hud) return;
    const mode = presentation ? presentation.mode : 'NATIVE';
    hud.querySelectorAll('[data-render]').forEach(b => {
      const on = b.dataset.render === mode;
      b.setAttribute('aria-pressed', String(on));
      if (on) b.setAttribute('data-active', 'true'); else b.removeAttribute('data-active');
    });
  }

  function buildHUD() {
    if (root()) return root();
    const el = document.createElement('div');
    el.id = 'play-hud';
    el.innerHTML = `
      <div class="ph-top">
        <span class="ph-camselector" role="group" aria-label="Camera mode">
          <button data-cam="isometric">1 Isometric</button>
          <button data-cam="over-shoulder">2 Shoulder</button>
          <button data-cam="third-person">3 Third</button>
          <button data-cam="cycle">C Cycle</button>
        </span>
        <span class="ph-renderselector" role="group" aria-label="Rendering mode">
          <button data-render="NATIVE">Native</button>
          <button data-render="REFERENCE">Clean ref</button>
          <button data-render="NEURAL">Neural</button>
        </span>
        <span class="ph-objective" data-hud-objective role="status"></span>
        <span class="ph-controls">
          <button id="ph-pause">Pause ⏸</button>
          <button id="ph-exit">Return to Editor</button>
        </span>
      </div>
      <div class="ph-bottom"><span data-hud-camera class="ph-mode"></span><span data-hud-render class="ph-mode"></span><span class="ph-hint">WASD move · mouse look · 1/2/3/C camera · Esc pause</span></div>
      <dialog id="ph-pause-menu">
        <div class="ph-menubox">
          <h2>Paused</h2>
          <button id="ph-resume">Resume</button>
          <button id="ph-exit-2">Return to Editor</button>
        </div>
      </dialog>`;
    el.querySelectorAll('[data-cam]').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.cam)));
    el.querySelectorAll('[data-render]').forEach(b => b.addEventListener('click', () => switchRenderMode(b.dataset.render)));
    el.querySelector('#ph-pause').addEventListener('click', () => pause());
    el.querySelector('#ph-exit').addEventListener('click', () => exitPlay());
    el.querySelector('#ph-resume').addEventListener('click', () => resume());
    el.querySelector('#ph-exit-2').addEventListener('click', () => exitPlay());
    document.body.appendChild(el);
    hud = el;
    reflectRenderSelector(); // initialize selector to the current (honest) mode
    return el;
  }

  function switchMode(mode) {
    if (!director) return;
    if (mode === 'cycle') {
      const idx = MODE_ORDER.indexOf(director.mode);
      mode = MODE_ORDER[(idx + 1 + MODE_ORDER.length) % MODE_ORDER.length];
    }
    director.setMode(mode);
    refreshHUD();
  }

  // Rendering selector (Phase 4). Presentation-only: selecting NEURAL without a
  // real backend is refused (or labelled), never silently asserted. No gameplay
  // authority changes — the selector only routes already-authoritative frames.
  function switchRenderMode(mode) {
    if (!presentation) { status('Renderer selector unavailable (no presentation controller)'); reflectRenderSelector(); return; }
    if (mode === 'NEURAL') {
      // Honesty gate: NEURAL is only entered with a verified non-mock backend.
      // No backend → refuse (never fabricate neural presentation).
      if (!hasRealNeuralBackend()) {
        const reason = 'Neural unavailable on this host (no verified model backend; see REMOTE_GPU_ACTIVATION_RUNBOOK)';
        presentation.fallback(reason);
        status(reason);
        reflectRenderSelector();
        return;
      }
      presentation.setMode('NEURAL', { backendMock: false, reason: 'user selected neural' });
    } else {
      presentation.setMode(mode, { reason: 'user selected renderer' });
    }
    refreshHUD();
  }

  function requestPointerLock() {
    const canvas = $('canvas');
    if (!canvas) return;
    canvas.requestPointerLock?.();
  }

  // ── input handlers (scoped to play mode) ─────────────────────────────
  function onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') { e.preventDefault(); if (state.simulation?.metrics().lifecycle.state === 'running') pause(); return; }
    if (e.key === '1') { switchMode('isometric'); return; }
    if (e.key === '2') { switchMode('over-shoulder'); return; }
    if (e.key === '3') { switchMode('third-person'); return; }
    if (e.key.toLowerCase() === 'c') { switchMode('cycle'); return; }
  }
  function onMouseMove(e) {
    if (document.pointerLockElement !== $('canvas')) return;
    lookYaw += e.movementX * 0.0025;
    lookPitch = Math.max(-1.1, Math.min(1.1, lookPitch + e.movementY * 0.0025));
    director?.setLook(lookYaw, lookPitch);
  }
  function onPointerLockChange() {
    // Losing the pointer lock (Esc from lock) should not exit play; the user can re-click.
    if (!document.pointerLockElement) lookYaw = lookPitch = 0;
  }
  function onFullscreenChange() {
    if (!active) return;
    // Fullscreen exit does not exit play (full-window fallback keeps the game running).
  }
  function onResize() { viewport.render(); }

  function pause() {
    state.simulation?.pause();
    director && (document.body.classList.add('is-ph-paused'));
    const menu = root()?.querySelector('#ph-pause-menu');
    if (menu && typeof menu.showModal === 'function' && !menu.open) menu.showModal();
  }
  function resume() {
    const menu = root()?.querySelector('#ph-pause-menu');
    if (menu?.open) menu.close();
    document.body.classList.remove('is-ph-paused');
    state.simulation?.resume();
  }

  async function enterPlay() {
    if (active) return;
    active = true;
    // 1. Enter fullscreen synchronously within the user gesture (before async),
    //    with a full-window CSS fallback when unavailable or denied.
    document.body.classList.add('is-play');
    let fs = false;
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        fs = !!document.fullscreenElement;
      }
    } catch { /* denied → fall back to full-window */ }
    status(fs ? 'Playing · fullscreen' : 'Playing · full-window fallback');

    // 2. Ensure the isolated simulation is built and running.
    await ensureSimulation();
    state.simulation.resume();

    // 3. Initialize the gameplay camera on the controlled entity.
    director?.dispose();
    const target = findFollowTarget();
    director = createCameraDirector(state.simulation, { preset: state.cameraPreset ?? undefined });
    director.setTransitionDuration(0.35);
    if (target) director.follow(target);
    if (state.cameraBasis) director.bindMovementBasis(state.cameraBasis);
    lookYaw = lookPitch = 0;

    // 4. HUD.
    hud = buildHUD();
    refreshHUD();

    // 5. Input.
    addEventListener('keydown', onKeyDown);
    addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    addEventListener('resize', onResize);
    const canvas = $('canvas');
    canvas?.addEventListener('click', requestPointerLock);
    // Pointer lock is acquired on the first canvas click (a trusted user gesture),
    // not in enterPlay, so it is never denied for lack of activation.
  }

  async function exitPlay() {
    if (!active) return;
    active = false;
    const menu = root()?.querySelector('#ph-pause-menu');
    if (menu?.open) menu.close();
    document.body.classList.remove('is-play', 'is-ph-paused');
    removeEventListener('keydown', onKeyDown);
    removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    removeEventListener('resize', onResize);
    $('canvas')?.removeEventListener('click', requestPointerLock);
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
    director?.dispose();
    director = null;
    hud?.remove();
    hud = null;
    state.input.clear();
    // Reset the isolated simulation without touching the authored scene.
    await reset();
    status('Returned to editor · authored scene unchanged');
  }

  // Provide a per-frame hook so the studio frame loop can drive the camera + HUD
  // after viewport.sync(...) but before render().
  function frameHook() {
    if (!active || !director) return null;
    const pose = director.update();
    if (pose) viewport.directCamera(pose);
    refreshHUD();
    return pose;
  }

  return {
    enterPlay,
    exitPlay,
    frameHook,
    get active() { return active; },
    get director() { return director; },
  };
}
