/**
 * ZekNova — background score
 * Location: src/game/MusicDirector.js
 *
 * Two authored tracks, chosen by what the player is actually doing:
 *
 *   Weightless Horizons  exploration, building, travel — the default bed
 *   ZekNova Awakens      a Guardian encounter is live
 *
 * The combat audio in CombatAudioDirector.js is procedural synthesis
 * (`assetFilesAvailable: 0`) and stays that way — it fires short percussive
 * hits keyed to individual blows. This owns the long-form bed underneath it.
 * They share nothing but the speakers, deliberately: a stinger must never
 * have to wait on a 7 MB decode.
 *
 * DECISION IS SEPARATE FROM PLAYBACK. `trackFor()` is pure and testable in
 * Node; everything that touches an <audio> element lives in the class. That
 * split is what lets the state machine be tested without a DOM.
 *
 * WHY POLLING, NOT A BUNDLE HOOK. `bossManager.active` is set inside the
 * compatibility bundle, which is a governance-controlled artifact requiring a
 * re-attestation to edit. A 250 ms poll of state the bundle already exposes on
 * globalThis reads the same transition one frame later and costs nothing —
 * cheaper than re-attesting the runtime for a music cue.
 *
 * AUTOPLAY. Browsers refuse audio before a user gesture. ZekNova always starts
 * behind a LAUNCH click, so arm() is called from that gesture; if a play()
 * still rejects, the director stays silent and retries on the next gesture
 * rather than throwing.
 */

export const TRACKS = Object.freeze({
  exploration: Object.freeze({
    id: "exploration",
    src: "./assets/audio/weightless-horizons.mp3",
    title: "Weightless Horizons",
    gain: 0.34,
  }),
  boss: Object.freeze({
    id: "boss",
    src: "./assets/audio/zeknova-awakens.mp3",
    title: "ZekNova Awakens",
    gain: 0.42,
  }),
});

export const MUSIC_STORAGE_KEY = "zeknova.music.v1";
/** Crossfade length. Long enough not to jar, short enough that a Guardian
 *  appearing still feels like an event. */
export const CROSSFADE_MS = 1200;

/**
 * Which track the current game state calls for, or null for silence.
 *
 * A boss is "live" only while its object exists AND the encounter has not been
 * resolved. `bossManager.active` alone is not enough: it lingers through the
 * defeat animation, and holding the battle theme over a victory reads as a
 * fight that is still going.
 */
export function trackFor(state) {
  if (!state || state.enabled === false) return null;
  if (!state.started) return null;
  const boss = state.bossActive === true && state.bossDefeated !== true;
  return boss ? TRACKS.boss.id : TRACKS.exploration.id;
}

/** Reads the decision inputs off a live game object, defensively. */
export function readGameState(game, { enabled = true, started = true } = {}) {
  const manager = game?.bossManager ?? null;
  const active = manager?.active ?? manager?.boss ?? null;
  return {
    enabled,
    started,
    bossActive: Boolean(active),
    // A boss whose health has hit zero is no longer a fight.
    bossDefeated: Boolean(active) && Number(active?.userData?.health ?? 1) <= 0,
  };
}

/** Persisted volume/mute, clamped. Never throws on a blocked localStorage. */
export function readPreference(storage) {
  const fallback = { muted: false, volume: 1 };
  try {
    const raw = storage?.getItem?.(MUSIC_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      muted: parsed?.muted === true,
      volume: Math.min(1, Math.max(0, Number(parsed?.volume ?? 1) || 0)),
    };
  } catch {
    return fallback;
  }
}

export function writePreference(storage, preference) {
  try {
    storage?.setItem?.(MUSIC_STORAGE_KEY, JSON.stringify({
      muted: preference.muted === true,
      volume: Math.min(1, Math.max(0, Number(preference.volume ?? 1) || 0)),
    }));
    return true;
  } catch {
    return false;
  }
}

export class MusicDirector {
  constructor({ game = null, doc = globalThis.document, storage = globalThis.localStorage, windowRef = globalThis } = {}) {
    this.game = game;
    this.doc = doc;
    this.window = windowRef;
    this.storage = storage;
    this.elements = {};
    this.current = null;
    this.started = false;
    this.timer = null;
    this.fades = {};
    const preference = readPreference(storage);
    this.muted = preference.muted;
    this.volume = preference.volume;
  }

  /** Builds the two looping elements. Idempotent. */
  install() {
    if (!this.doc || typeof this.doc.createElement !== "function") return false;
    if (this.elements.exploration) return true;
    for (const track of Object.values(TRACKS)) {
      const el = this.doc.createElement("audio");
      el.src = track.src;
      el.loop = true;
      el.preload = "auto";
      el.volume = 0;
      el.dataset.zeknovaTrack = track.id;
      // Kept out of the accessibility tree: it is ambience, not content.
      el.setAttribute("aria-hidden", "true");
      this.doc.body?.append?.(el);
      this.elements[track.id] = el;
    }
    return true;
  }

  /** Called from the LAUNCH gesture, so the first play() has permission. */
  arm() {
    this.started = true;
    this.sync();
    if (this.timer === null && this.window?.setInterval) {
      this.timer = this.window.setInterval(() => this.sync(), 250);
    }
    return true;
  }

  /** Reconciles what is playing with what the game state calls for. */
  sync() {
    const wanted = trackFor(readGameState(this.game ?? globalThis.ZekNovaGame, {
      enabled: !this.muted,
      started: this.started,
    }));
    if (wanted === this.current) return this.current;
    const previous = this.current;
    this.current = wanted;
    if (previous && this.elements[previous]) this.fade(previous, 0);
    if (wanted && this.elements[wanted]) {
      const el = this.elements[wanted];
      const play = el.play?.();
      // A rejected play() is the autoplay policy, not a fault. Stay silent.
      if (play?.catch) play.catch(() => {});
      this.fade(wanted, this.targetGain(wanted));
    }
    return this.current;
  }

  targetGain(id) {
    const track = TRACKS[id];
    if (!track || this.muted) return 0;
    return Math.min(1, Math.max(0, track.gain * this.volume));
  }

  /** Linear crossfade. Cancels any fade already running on that element. */
  fade(id, to, ms = CROSSFADE_MS) {
    const el = this.elements[id];
    if (!el) return false;
    if (this.fades[id]) { this.window?.clearInterval?.(this.fades[id]); this.fades[id] = null; }
    const from = Number(el.volume) || 0;
    const steps = Math.max(1, Math.round(ms / 50));
    let step = 0;
    if (!this.window?.setInterval) { el.volume = to; return true; }
    this.fades[id] = this.window.setInterval(() => {
      step += 1;
      const next = from + ((to - from) * (step / steps));
      el.volume = Math.min(1, Math.max(0, next));
      if (step >= steps) {
        this.window.clearInterval(this.fades[id]);
        this.fades[id] = null;
        el.volume = Math.min(1, Math.max(0, to));
        // Free the decoder when a track has gone fully silent.
        if (to === 0) { try { el.pause?.(); el.currentTime = 0; } catch { /* ignore */ } }
      }
    }, 50);
    return true;
  }

  setMuted(muted) {
    this.muted = muted === true;
    writePreference(this.storage, { muted: this.muted, volume: this.volume });
    if (this.muted) {
      for (const id of Object.keys(this.elements)) this.fade(id, 0, 300);
      this.current = null;
    } else {
      this.sync();
    }
    return this.muted;
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    writePreference(this.storage, { muted: this.muted, volume: this.volume });
    if (this.current) this.fade(this.current, this.targetGain(this.current), 200);
    return this.volume;
  }

  snapshot() {
    return Object.freeze({
      current: this.current,
      muted: this.muted,
      volume: this.volume,
      started: this.started,
      title: this.current ? TRACKS[this.current].title : null,
    });
  }

  dispose() {
    if (this.timer !== null) { this.window?.clearInterval?.(this.timer); this.timer = null; }
    for (const id of Object.keys(this.fades)) if (this.fades[id]) this.window?.clearInterval?.(this.fades[id]);
    for (const el of Object.values(this.elements)) { try { el.pause?.(); el.remove?.(); } catch { /* ignore */ } }
    this.elements = {};
    this.current = null;
  }
}

export default MusicDirector;
