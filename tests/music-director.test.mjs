import assert from "node:assert/strict";
import { existsSync, statSync, readFileSync } from "node:fs";
import {
  TRACKS, CROSSFADE_MS, MUSIC_STORAGE_KEY,
  trackFor, readGameState, readPreference, writePreference, MusicDirector,
} from "../src/game/MusicDirector.js";

let checks = 0;
const check = (label, cond) => { assert.ok(cond, label); checks++; };

// ── the audio actually ships ────────────────────────────────────────────
/* A director that points at a missing file fails silently at runtime — the
   browser just never plays anything. Assert the bytes are on disk and are
   really MP3, not a rename or an HTML error page saved with the wrong suffix. */
const root = new URL("../", import.meta.url);
for (const track of Object.values(TRACKS)) {
  const url = new URL(track.src.replace(/^\.\//, ""), root);
  check(`${track.title}: file exists at ${track.src}`, existsSync(url));
  const size = statSync(url).size;
  check(`${track.title}: is not a stub (${size} bytes)`, size > 1_000_000);
  const head = readFileSync(url).subarray(0, 3).toString("latin1");
  check(`${track.title}: has an MP3/ID3 header`, head === "ID3" || head.charCodeAt(0) === 0xff);
}
check("exploration is Weightless Horizons", TRACKS.exploration.title === "Weightless Horizons");
check("boss is ZekNova Awakens", TRACKS.boss.title === "ZekNova Awakens");
check("the two tracks are different files", TRACKS.exploration.src !== TRACKS.boss.src);
check("boss theme is mixed louder than the bed", TRACKS.boss.gain > TRACKS.exploration.gain);
check("neither track would clip", Object.values(TRACKS).every((t) => t.gain > 0 && t.gain <= 1));

// ── the state machine ───────────────────────────────────────────────────
check("nothing plays before the game starts", trackFor({ started: false, bossActive: false }) === null);
check("exploration plays once started", trackFor({ started: true, bossActive: false }) === "exploration");
check("a live Guardian switches to the boss theme", trackFor({ started: true, bossActive: true }) === "boss");
check("a defeated Guardian returns to exploration",
  trackFor({ started: true, bossActive: true, bossDefeated: true }) === "exploration");
check("muted is silence, even in a boss fight",
  trackFor({ started: true, bossActive: true, enabled: false }) === null);
check("garbage state is silence, not a crash", trackFor(null) === null && trackFor(undefined) === null);

// ── reading a live game object ──────────────────────────────────────────
check("no bossManager reads as exploration",
  trackFor(readGameState({})) === "exploration");
check("bossManager.active reads as a boss fight",
  trackFor(readGameState({ bossManager: { active: { userData: { health: 400 } } } })) === "boss");
check("a zero-health boss is not a fight",
  trackFor(readGameState({ bossManager: { active: { userData: { health: 0 } } } })) === "exploration");
check("bossManager.boss is honoured as well as .active",
  trackFor(readGameState({ bossManager: { boss: { userData: { health: 10 } } } })) === "boss");
check("a boss with no health field counts as alive",
  trackFor(readGameState({ bossManager: { active: {} } })) === "boss");
check("a null game does not throw", trackFor(readGameState(null)) === "exploration");

// ── preferences ─────────────────────────────────────────────────────────
const mem = (() => { let v = {}; return { getItem: (k) => v[k] ?? null, setItem: (k, s) => { v[k] = s; } }; })();
check("default preference is unmuted at full volume",
  readPreference(mem).muted === false && readPreference(mem).volume === 1);
writePreference(mem, { muted: true, volume: 0.5 });
check("preference round-trips", readPreference(mem).muted === true && readPreference(mem).volume === 0.5);
writePreference(mem, { muted: false, volume: 9 });
check("volume above 1 is clamped", readPreference(mem).volume === 1);
writePreference(mem, { muted: false, volume: -4 });
check("negative volume is clamped", readPreference(mem).volume === 0);

/* NEGATIVE CONTROL — a browser with storage blocked throws on every access.
   The director must stay usable, not take the game down with it. */
const hostile = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
check("a throwing storage still yields defaults", readPreference(hostile).volume === 1);
check("a throwing storage reports the write failed", writePreference(hostile, { muted: true }) === false);
check("corrupt stored JSON falls back to defaults",
  readPreference({ getItem: () => "{not json" }).muted === false);

// ── the director, with a stub DOM ───────────────────────────────────────
const made = [];
const stubDoc = {
  createElement() {
    const el = { volume: 0, dataset: {}, play: () => Promise.resolve(), pause() { this.paused = true; },
                 setAttribute() {}, remove() {}, currentTime: 0 };
    made.push(el); return el;
  },
  body: { append() {} },
};
const stubWin = { setInterval: () => 1, clearInterval: () => {} };
const game = { bossManager: { active: null } };
const director = new MusicDirector({ game, doc: stubDoc, storage: mem, windowRef: stubWin });
check("install builds one element per track", director.install() === true && made.length === 2);
check("install is idempotent", director.install() === true && made.length === 2);
check("nothing plays before arm()", director.snapshot().current === null);
director.arm();
check("arm starts the exploration bed", director.snapshot().current === "exploration");
game.bossManager.active = { userData: { health: 900 } };
check("a Guardian appearing switches the track", director.sync() === "boss");
check("...and the snapshot names it", director.snapshot().title === "ZekNova Awakens");
game.bossManager.active = { userData: { health: 0 } };
check("defeating it returns to the bed", director.sync() === "exploration");
director.setMuted(true);
check("muting silences the score", director.snapshot().current === null && director.snapshot().muted === true);
director.setMuted(false);
check("unmuting resumes", director.snapshot().current === "exploration");
check("volume is clamped on the director too", director.setVolume(5) === 1 && director.setVolume(-1) === 0);
check("crossfade is a sane length", CROSSFADE_MS >= 400 && CROSSFADE_MS <= 4000);
check("storage key is namespaced", MUSIC_STORAGE_KEY.startsWith("zeknova."));
director.dispose();
check("dispose clears the elements", director.snapshot().current === null);

/* A director with no DOM at all must refuse cleanly rather than throw — that
   is the Node/SSR path and the headless test harness. */
const headless = new MusicDirector({ game, doc: null, storage: mem, windowRef: stubWin });
check("no document is a clean refusal", headless.install() === false);

console.log(`Music director tests passed (${checks} checks).`);
