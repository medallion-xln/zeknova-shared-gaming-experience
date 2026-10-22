/**
 * CaptureFilter — hides presentation-only scene objects for the duration of a
 * clean capture and restores them afterwards. HUD in ZekNova is DOM, so the
 * canvas is already HUD-free; this filter removes in-scene overlays (sprites,
 * labels, debug helpers, telegraph text).
 */
export const DEFAULT_OVERLAY_PREDICATE = (object) => !!(object?.isSprite || object?.isCSS2DObject || object?.isCSS3DObject || object?.userData?.hudOverlay || object?.userData?.zkOverlay || object?.userData?.debugHelper || object?.isHelper || /label|caption|telegraph-text|debug/i.test(String(object?.name ?? "")));

export class CaptureFilter {
  constructor({ isOverlay = DEFAULT_OVERLAY_PREDICATE } = {}) { this.isOverlay = isOverlay; this.hidden = []; this.lastHiddenCount = 0; }
  /** Hide overlays under `root`. Returns the number hidden. */
  apply(root) {
    this.hidden.length = 0;
    const visit = (object) => { if (!object) return; if (object.visible && this.isOverlay(object)) { this.hidden.push(object); object.visible = false; return; } for (const child of object.children ?? []) visit(child); };
    visit(root); this.lastHiddenCount = this.hidden.length; return this.lastHiddenCount;
  }
  restore() { for (const object of this.hidden) object.visible = true; const n = this.hidden.length; this.hidden.length = 0; return n; }
}
