/**
 * EngineClock — one simulation timing authority.
 *
 * Modes:
 *  - "owned":     the kernel advances fixed simulation steps from frame deltas
 *                 (accumulator, max catch-up, interpolation alpha).
 *  - "delegated": another runtime owns time (the legacy ZekNova bundle during
 *                 compatibility operation). The clock only observes frame
 *                 timing for metrics and NEVER steps anything — this is how
 *                 the kernel avoids becoming a second simulation authority.
 *
 * Time sources are injectable so tests get reproducible results.
 */
export class ManualTimeSource {
  constructor(startMs = 0) { this.current = startMs; }
  now() { return this.current; }
  advanceBy(ms) { this.current += ms; return this.current; }
  set(ms) { this.current = ms; return this.current; }
}

export const defaultTimeSource = { now: () => (globalThis.performance?.now?.() ?? Date.now()) };

export class EngineClock {
  /**
   * @param {{ fixedStep?: number, maxSubsteps?: number, maxFrameDelta?: number, mode?: 'owned'|'delegated', timeSource?: { now(): number } }} [options]
   */
  constructor({ fixedStep = 1 / 60, maxSubsteps = 5, maxFrameDelta = 0.1, mode = "owned", timeSource = defaultTimeSource } = {}) {
    if (!(fixedStep > 0)) throw new RangeError("fixedStep must be > 0");
    if (!(maxSubsteps >= 1)) throw new RangeError("maxSubsteps must be >= 1");
    if (!["owned", "delegated"].includes(mode)) throw new RangeError(`unknown clock mode "${mode}"`);
    this.fixedStep = fixedStep; this.maxSubsteps = maxSubsteps; this.maxFrameDelta = maxFrameDelta;
    this.mode = mode; this.timeSource = timeSource;
    /** @type {((dt: number, stepNumber: number) => void) | null} */
    this.onStep = null;
    this.reset();
  }

  reset() {
    this.accumulator = 0; this.stepNumber = 0; this.simulationTime = 0; this.alpha = 0;
    this.elapsed = 0; this.frames = 0; this.clampedFrames = 0; this.droppedTime = 0;
    this.paused = false; this.lastNow = null; this.lastFrameDelta = 0;
  }

  pause() { if (this.paused) return false; this.paused = true; return true; }
  resume() { if (!this.paused) return false; this.paused = false; this.lastNow = null; return true; }

  setMode(mode) {
    if (!["owned", "delegated"].includes(mode)) throw new RangeError(`unknown clock mode "${mode}"`);
    this.mode = mode; this.accumulator = 0; this.lastNow = null;
  }

  /**
   * Advance by a wall-clock frame delta (seconds). In "owned" mode this runs
   * fixed steps through `onStep`; in "delegated" mode it only records timing.
   */
  advance(frameDeltaSeconds) {
    const raw = Number(frameDeltaSeconds) || 0;
    const delta = Math.min(this.maxFrameDelta, Math.max(0, raw));
    this.frames += 1; this.lastFrameDelta = delta; this.elapsed += delta;
    if (this.paused) return Object.freeze({ substeps: 0, alpha: this.alpha, paused: true, delegated: this.mode === "delegated" });
    if (this.mode === "delegated") return Object.freeze({ substeps: 0, alpha: 0, paused: false, delegated: true });
    this.accumulator += delta;
    let substeps = 0;
    while (this.accumulator >= this.fixedStep && substeps < this.maxSubsteps) {
      this.stepNumber += 1; this.simulationTime += this.fixedStep; this.accumulator -= this.fixedStep; substeps += 1;
      this.onStep?.(this.fixedStep, this.stepNumber);
    }
    if (this.accumulator >= this.fixedStep) {
      const dropped = this.accumulator - (this.accumulator % this.fixedStep);
      this.droppedTime += dropped; this.accumulator %= this.fixedStep; this.clampedFrames += 1;
    }
    this.alpha = this.accumulator / this.fixedStep;
    return Object.freeze({ substeps, alpha: this.alpha, paused: false, delegated: false });
  }

  /** Advance using the injected time source (ms). First call establishes the baseline. */
  tick(nowMs = this.timeSource.now()) {
    if (this.lastNow === null) { this.lastNow = nowMs; return this.advance(0); }
    const delta = (nowMs - this.lastNow) / 1000; this.lastNow = nowMs;
    return this.advance(delta);
  }

  /** Deterministic stepping for tests and headless runs: exactly `n` fixed steps. */
  step(n = 1) {
    if (this.mode !== "owned") throw new Error("EngineClock.step() requires owned mode");
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("step count must be a non-negative integer");
    for (let i = 0; i < n; i += 1) { this.stepNumber += 1; this.simulationTime += this.fixedStep; this.onStep?.(this.fixedStep, this.stepNumber); }
    this.alpha = 0;
    return this.stepNumber;
  }

  snapshot() {
    return Object.freeze({ mode: this.mode, fixedStep: this.fixedStep, fixedHz: Math.round(1 / this.fixedStep), maxSubsteps: this.maxSubsteps, stepNumber: this.stepNumber, simulationTime: this.simulationTime, accumulator: this.accumulator, alpha: this.alpha, paused: this.paused, frames: this.frames, elapsed: this.elapsed, clampedFrames: this.clampedFrames, droppedTime: this.droppedTime, lastFrameDelta: this.lastFrameDelta });
  }
}
