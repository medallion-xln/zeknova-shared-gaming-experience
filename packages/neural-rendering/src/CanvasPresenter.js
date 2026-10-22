/** Draws display frames on an overlay canvas above the native canvas; hidden on fallback so native output shows through. Browser-only. */
export class CanvasPresenter {
  constructor({ document = globalThis.document, parent = null, label = "NEURAL", id = "zge-neural-presenter" }) { this.document = document; this.parent = parent; this.label = label; this.id = id; this.canvas = null; this.ctx = null; this.badge = null; this.presented = 0; this.hidden = true; }
  mount() {
    if (this.canvas || !this.document) return this;
    const canvas = this.document.createElement("canvas"); canvas.id = this.id; canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;display:none;image-rendering:auto"; canvas.setAttribute("aria-hidden", "true");
    const badge = this.document.createElement("div"); badge.id = `${this.id}-badge`; badge.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;font:600 11px/1.4 monospace;letter-spacing:.08em;padding:3px 8px;border-radius:4px;background:#2a0f4ccc;color:#f5d0ff;display:none"; badge.textContent = this.label;
    (this.parent ?? this.document.body).append(canvas, badge); this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.badge = badge; return this;
  }
  present(frame) { if (!this.canvas) this.mount(); if (!this.ctx) return; if (this.canvas.width !== frame.width || this.canvas.height !== frame.height) { this.canvas.width = frame.width; this.canvas.height = frame.height; } const image = new ImageData(frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data), frame.width, frame.height); this.ctx.putImageData(image, 0, 0); if (this.hidden) { this.canvas.style.display = "block"; this.badge.style.display = "block"; this.hidden = false; } this.presented += 1; }
  fallback(reason) { if (this.canvas) { this.canvas.style.display = "none"; this.badge.style.display = "none"; } this.hidden = true; this.lastFallback = reason; }
  recover() { /* next present() re-shows */ }
  setLabel(label) { this.label = label; if (this.badge) this.badge.textContent = label; }
  dispose() { this.canvas?.remove(); this.badge?.remove(); this.canvas = null; this.ctx = null; this.badge = null; }
}
