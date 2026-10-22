/** Presentation modes. NEURAL may only be entered with a real backend unless `allowMock` is set, and a mock is always labelled. */
export const PRESENTATION_MODES = Object.freeze({ NATIVE: "NATIVE", REFERENCE: "REFERENCE", NEURAL: "NEURAL" });
export class PresentationController {
  constructor({ initial = "NATIVE", allowMock = false, onChange = null, now = () => Date.now() } = {}) { this.mode = initial; this.allowMock = allowMock; this.onChange = onChange; this.now = now; this.fallbackReason = null; this.backendMock = null; this.history = []; }
  /** @param {{ reason?: string, backendMock?: boolean|null }} [options] */
  setMode(mode, { reason = null, backendMock = null } = {}) {
    if (!Object.values(PRESENTATION_MODES).includes(mode)) throw new RangeError(`unknown presentation mode "${mode}"`);
    if (mode === "NEURAL") { if (backendMock === null) throw new Error("NEURAL mode requires a backend declaration (mock or real)"); if (backendMock && !this.allowMock) throw new Error("NEURAL mode with a mock backend is disabled (set allowMock for development)"); this.backendMock = backendMock; }
    const from = this.mode; this.mode = mode; this.fallbackReason = mode === "NATIVE" && reason ? reason : null;
    this.history.push(Object.freeze({ from, to: mode, reason, at: this.now() })); if (this.history.length > 50) this.history.shift();
    if (from !== mode) this.onChange?.(from, mode, reason); return mode;
  }
  fallback(reason) { return this.setMode("NATIVE", { reason: `fallback: ${reason}` }); }
  label() { return this.mode === "NEURAL" ? (this.backendMock ? "NEURAL (MOCK — not model inference)" : "NEURAL") : this.mode; }
  status() { return Object.freeze({ mode: this.mode, label: this.label(), fallbackReason: this.fallbackReason, mock: this.mode === "NEURAL" ? !!this.backendMock : null, allowMock: this.allowMock, history: [...this.history] }); }
}
