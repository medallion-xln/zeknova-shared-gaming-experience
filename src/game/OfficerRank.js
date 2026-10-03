/**
 * ZekNova — officer rank derived from standing infrastructure
 * Location: src/game/OfficerRank.js
 *
 * Rank is EARNED from what is standing on the planet right now, and it is lost
 * when that infrastructure is lost. `CampaignPlan.rankForInfrastructure()` has
 * always said so in its docblock; nothing ever called it during play, so in
 * practice rank only ever ratcheted upward. A Captain kept the rank — and the
 * flight and mech loadout that comes with it — while commanding a flattened
 * planet, and kept it through a full world reset.
 *
 * This module owns the DERIVATION: pure, deterministic, testable in Node. The
 * runtime owns applying it, because swapping the officer model needs three.js
 * and the live scene graph.
 *
 * TWO THINGS THE NAIVE VERSION GETS WRONG
 * ---------------------------------------
 * 1. A destroyed building is NOT removed from `buildings.records`. It is left
 *    in place with `health <= 0` and drawn flattened. Counting records
 *    directly means a razed colony still reads as a full one, so rank would
 *    never fall no matter how much was destroyed. Standing means health > 0.
 *
 * 2. Building records have NO `biome` field — they carry world coordinates.
 *    `completedProjects()` filters on `b.biome`, so feeding it raw records
 *    matches nothing and reports zero projects for every real save. Biome is
 *    derived from `x` through the same `biomeAt()` the world uses, so a
 *    structure is credited to the AO it physically stands in.
 *
 * A project counts only when it stands in all five biomes (CampaignPlan's
 * rule, unchanged here): four Solar Grids and an unpowered Arctic is not a
 * completed project. That also means losing ONE structure in ONE AO can
 * un-complete a whole project and cost a rank. That is deliberate.
 */

import { biomeAt } from "../world/Biomes.js";
import { rankForInfrastructure, RANK_THRESHOLDS } from "./CampaignPlan.js";

export const RANK_ORDER = Object.freeze({ ensign: 0, lieutenant: 1, captain: 2 });

/**
 * Is this structure standing?
 *
 * `health` absent means a record predating health tracking — those are intact,
 * so absent reads as standing. Only an explicit non-positive health is rubble.
 * `(record.health ?? 1) > 0` would treat a legitimate 0 as absent if written
 * as `record.health || 1`, which is the trap here.
 */
export function isStanding(record) {
  if (!record || typeof record !== "object") return false;
  const health = record.health;
  if (health === undefined || health === null) return true;
  return Number(health) > 0;
}

/** Standing structures only, each tagged with the AO it physically occupies. */
export function standingInfrastructure(records) {
  const list = Array.isArray(records) ? records : [];
  const out = [];
  for (const record of list) {
    if (!isStanding(record)) continue;
    const type = record.type;
    if (typeof type !== "string" || type === "") continue;
    // An explicit biome wins when present; otherwise derive it from position.
    const biome = typeof record.biome === "string" && record.biome !== ""
      ? record.biome
      : (Number.isFinite(Number(record.x)) ? biomeAt(Number(record.x))?.id : undefined);
    if (!biome) continue;
    out.push({ type, biome });
  }
  return out;
}

/** Rank owed for a set of building records. Never throws on malformed input. */
export function rankFromRecords(records) {
  return rankForInfrastructure(standingInfrastructure(records));
}

/**
 * A cheap change token for the standing world.
 *
 * Recomputing the full project matrix every frame is wasteful; comparing this
 * string is not. It changes exactly when a type/biome pair gains or loses a
 * standing structure, which is exactly when rank can change.
 */
export function infrastructureSignature(records) {
  const counts = new Map();
  for (const { type, biome } of standingInfrastructure(records)) {
    const key = `${type}@${biome}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `${k}:${n}`).join("|");
}

/** Which direction a rank change goes. Used to pick the right toast. */
export function rankDelta(from, to) {
  const a = RANK_ORDER[from] ?? 0;
  const b = RANK_ORDER[to] ?? 0;
  if (b > a) return "promotion";
  if (b < a) return "demotion";
  return "unchanged";
}

/**
 * Which rank to apply when the server offers one.
 *
 * The server computes rank from the LAST SAVED world. Placing a structure does
 * not save immediately, and the progression sync runs on its own 8-second
 * interval, so between a placement and the next successful save the server is
 * behind the world the player is looking at. Applying its answer there demoted
 * a player a second after the same infrastructure had just promoted them.
 *
 * Standing infrastructure is the live authority whenever it can be derived.
 * The server value is used before the world has loaded — at join, when there
 * are no records yet — and remains authoritative for persistence, the
 * leaderboard, and the rank a returning player starts with.
 *
 * Note that a razed world still HAS records (destroyed structures are never
 * removed), so `records.length` distinguishes "world not loaded yet" from
 * "world loaded and empty", which are different answers.
 */
export function reconcileServerRank(records, serverRank) {
  const list = Array.isArray(records) ? records : [];
  const fallback = RANK_ORDER[serverRank] === undefined ? "ensign" : serverRank;
  if (list.length === 0) return { rank: fallback, source: "server" };
  const owed = rankFromRecords(list).rank;
  return owed === fallback
    ? { rank: fallback, source: "agreed" }
    : { rank: owed, source: "local" };
}

globalThis.ZekNovaRank = Object.freeze({
  version: 1,
  RANK_ORDER,
  RANK_THRESHOLDS,
  isStanding,
  standingInfrastructure,
  rankFromRecords,
  reconcileServerRank,
  infrastructureSignature,
  rankDelta,
});

export default globalThis.ZekNovaRank;
