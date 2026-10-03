/**
 * ZekNova — planetary campaign plan
 * Location: /src/game/CampaignPlan.js
 *
 * ONE SOURCE OF TRUTH for three things that were previously implicit or
 * inconsistent: which biome receives which project in which mission, what
 * officer rank the player currently holds, and how hard the Guardian in a
 * given mission hits.
 *
 * ── WHY THE CAMPAIGN IS SHAPED LIKE THIS ─────────────────────────────────
 * The campaign used to be a mix: missions 1–4 spanned all five biomes, while
 * missions 5–12 each dropped a single building in a single biome. So the
 * Arctic could end the campaign with a Solar Grid and nothing else, and the
 * player was never told which region was supposed to receive what.
 *
 * Now every mission delivers exactly ONE ZekNova project to ALL FIVE biomes:
 *
 *     10 items per mission
 *      = 5 preparation items (one per biome)
 *      + 5 construction items (one per biome)
 *
 * Every biome therefore contributes exactly two items to every mission, and
 * at the end of mission N every biome has the same N projects. Infrastructure
 * is planetary, which is what "Prepare the Planet" claims.
 *
 * The Guardian encounter is deliberately NOT one of the ten. It is the gate on
 * the mission, not an item in its checklist.
 *
 * ── THE PROJECT LADDER ───────────────────────────────────────────────────
 * Order is a dependency chain, not flavour: you cannot run a communications
 * hub without power, or house people without water. Solar → Water →
 * Communications → Defense is the requested spine; civic and economic
 * projects follow once the utilities exist.
 *
 * Mission ids are NOT renamed. They are load-bearing for save files and boss
 * mapping. Only the project each one delivers is defined here.
 */

/** Canonical biome order. Every mission walks these in this order. */
export const BIOMES = Object.freeze(["forest", "desert", "highlands", "arctic", "wetlands"]);

/** Items each mission contains, split evenly across the biomes. */
export const PREPARATION_ITEMS_PER_MISSION = 5;
export const CONSTRUCTION_ITEMS_PER_MISSION = 5;
export const ITEMS_PER_MISSION = PREPARATION_ITEMS_PER_MISSION + CONSTRUCTION_ITEMS_PER_MISSION; // 10

const title = (b) => b[0].toUpperCase() + b.slice(1);

/**
 * The twelve projects, in delivery order.
 *
 * `prep` names the preparation each biome performs before that biome's build.
 * `type` must exist in HUMAN_BUILDINGS — verified by the test suite rather
 * than assumed here.
 */
/* Only building types present in BOTH repositories' catalogues are used. The
   two Buildings.js files diverge — `research` (AI Research Lab) exists in one
   and not the other — so a ladder using it would generate an unbuildable
   objective in one build and pass tests in the other. The suite verifies every
   type against the real catalogue for exactly this reason.

   Titles are display-only and are set here so the mission name states what it
   delivers. Mission IDS are untouched: they are load-bearing for save files
   and boss mapping. */
export const PROJECT_LADDER = Object.freeze([
  { mission: "grid",              title: "Bring the lights online", type: "power",          project: "Solar Grid",                 verb: "Power",      prep: "survey",  prepLabel: "Survey solar exposure" },
  { mission: "water",             title: "Water for ZekNova",       type: "water",          project: "Water Works",                verb: "Irrigate",   prep: "recover", prepLabel: "Recover filtration compounds" },
  { mission: "tower-one",         title: "Connect the planet",      type: "communications", project: "Quantum Communications Hub", verb: "Connect",    prep: "recover", aidBiome: "forest", prepLabel: "Recover relay components" },
  { mission: "habitat",           title: "Shield the settlements",  type: "defense",        project: "Defense Tower",              verb: "Shield",     prep: "combat",  prepLabel: "Clear hostiles from the build site" },
  { mission: "governance",        title: "A planetary home",        type: "habitat",        project: "Habitat",                    verb: "Settle",     prep: "harvest", aidBiome: "desert", prepLabel: "Harvest frames for settlement" },
  { mission: "population",        title: "Regional government",     type: "capitol",        project: "Regional Capitol",           verb: "Govern",     prep: "recover", aidBiome: "highlands",     prepLabel: "Complete a ZekNovan infrastructure build" },
  { mission: "research",          title: "Planetary healthcare",    type: "hospital",       project: "Planetary Hospital",         verb: "Heal",       prep: "recover", prepLabel: "Recover medical compounds" },
  { mission: "culture",           title: "Education for ZekNova",   type: "university",     project: "University Campus",          verb: "Educate",    prep: "recover", aidBiome: "arctic", prepLabel: "Recover archive fragments" },
  { mission: "supply-route",      title: "Transit and supply",      type: "transit",        project: "Planetary Transit Hub",      verb: "Link",       prep: "survey",  prepLabel: "Chart the transit corridor" },
  { mission: "stronghold",        title: "Commerce and trade",      type: "commerce",       project: "Trade and Civic Center",     verb: "Trade",      prep: "combat", aidBiome: "wetlands",  prepLabel: "Clear hostiles from the trade corridor" },
  { mission: "advanced-research", title: "Fortune 500 ZekNova",     type: "corporate_hq",   project: "Fortune 500 Headquarters",   verb: "Incorporate",prep: "recover", aidBiome: "forest",     prepLabel: "Complete a ZekNovan infrastructure build" },
  { mission: "tower-ring",        title: "The ZekNova Exchange",    type: "stock_exchange", project: "ZekNova Stock Exchange",     verb: "Capitalise", prep: "harvest", prepLabel: "Harvest materials for the exchange floor" },
]);

/** Campaign position (1-based) of a mission id, or 0 when unknown. */
export function missionNumber(missionId) {
  const i = PROJECT_LADDER.findIndex((p) => p.mission === missionId);
  return i === -1 ? 0 : i + 1;
}

/** The project a mission delivers. */
export function projectFor(missionId) {
  return PROJECT_LADDER.find((p) => p.mission === missionId) ?? null;
}

/**
 * Which biome receives which project, stated explicitly.
 * Returns [{ biome, type, project, missionNumber }] for one mission — the
 * answer to "which biome gets what in mission N".
 */
export function biomeAssignments(missionId) {
  const p = projectFor(missionId);
  if (!p) return [];
  const n = missionNumber(missionId);
  return BIOMES.map((biome) => ({
    biome,
    type: p.type,
    project: p.project,
    missionNumber: n,
    label: `${p.verb} the ${title(biome)} AO — ${p.project}`,
  }));
}

/**
 * The full 10-item checklist for a mission, in the order the HUD shows it.
 *
 * Preparation and construction are interleaved by biome so the player reads
 * "prepare Forest, build Forest, prepare Desert, build Desert…" rather than
 * five surveys followed by five unrelated builds.
 */
export function missionItems(missionId) {
  const p = projectFor(missionId);
  if (!p) return [];
  const n = missionNumber(missionId);
  const prep = [];
  const build = [];

  for (const biome of BIOMES) {
    const where = `${title(biome)} AO`;

    /* AT MOST ONE ZEKNOVAN AID PROJECT PER MISSION.
       -------------------------------------------------------------------
       Every aid build starts a cooldown of 3-10 minutes, scaled by how much
       tension it removes — the guard against buying the natives off in one
       sitting. Two missions used to ask for aid in ALL FIVE biomes, so
       finishing either meant up to fifty minutes of waiting with nothing to
       do. The cooldown is right; asking for five of them back to back was
       not.

       Aid is now one item on each of six missions, rotating biome, so the
       cooldown always overlaps work the player can actually get on with.
       Total aid projects across the campaign: 6, down from 10. Item counts
       are unchanged at ten per mission. */
    const isAidSlot = p.aidBiome === biome;
    const kind = isAidSlot ? "aid" : p.prep;

    prep.push({
      category: "preparation",
      kind,
      biome,
      target: prepTargetFor(kind, n),
      label: isAidSlot
        ? `Complete 1 ZekNovan aid project · ${where}`
        : `${p.prepLabel} · ${where}`,
    });
    build.push({
      category: "construction",
      kind: "biomeBuilding",
      biome,
      type: p.type,
      target: 1,
      label: `Install 1 ${p.project} in the ${where}`,
    });
  }
  return [...prep, ...build];
}

/**
 * How much preparation a biome demands.
 *
 * Scales gently with campaign position so late projects are not trivially
 * prepped, but stays flat for `survey` and `aid`, which are binary — you have
 * either entered the AO or you have not, and asking for "3 entries" would be
 * busywork rather than difficulty.
 */
export function prepTargetFor(prepKind, missionNo) {
  if (prepKind === "survey" || prepKind === "aid") return 1;
  const n = Math.max(1, Math.min(12, missionNo || 1));
  return 2 + Math.floor((n - 1) / 4);          // 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4
}

/** Every mission id in campaign order. */
export function campaignOrder() {
  return PROJECT_LADDER.map((p) => p.mission);
}

// ─────────────────────────────────────────────────────────────────────────
// OFFICER RANK — earned from infrastructure, and lost with it
// ─────────────────────────────────────────────────────────────────────────

/**
 * A project counts as COMPLETE only when it stands in all five biomes.
 *
 * That is the whole point of a planetary campaign: four Solar Grids and an
 * unpowered Arctic is not a completed project, and should not carry rank.
 *
 * @param buildings array of { type, biome } records
 */
export function completedProjects(buildings) {
  const list = Array.isArray(buildings) ? buildings : [];
  let done = 0;
  for (const p of PROJECT_LADDER) {
    const covered = new Set(
      list.filter((b) => b && b.type === p.type && BIOMES.includes(b.biome)).map((b) => b.biome)
    );
    if (covered.size === BIOMES.length) done++;
  }
  return done;
}

/** Rank thresholds, expressed in completed planetary projects. */
export const RANK_THRESHOLDS = Object.freeze([
  { rank: "captain",    label: "Captain",    minProjects: 8 },
  { rank: "lieutenant", label: "Lieutenant", minProjects: 4 },
  { rank: "ensign",     label: "Ensign",     minProjects: 0 },
]);

/**
 * Rank derived from what is actually standing on the planet.
 *
 * Rank was previously a stored value, so it survived a world reset: a player
 * who wiped their campaign kept "Captain" while commanding an empty planet.
 * Deriving it means a reset returns the player to Ensign automatically,
 * because zero buildings genuinely is zero projects — and it also means rank
 * is taken away if infrastructure is lost, which is what the rank is for.
 */
export function rankForInfrastructure(buildings) {
  const done = completedProjects(buildings);
  const tier = RANK_THRESHOLDS.find((t) => done >= t.minProjects) ?? RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1];
  return { rank: tier.rank, label: tier.label, completedProjects: done };
}

// ─────────────────────────────────────────────────────────────────────────
// GUARDIAN DIFFICULTY — scales across the campaign
// ─────────────────────────────────────────────────────────────────────────

/**
 * Difficulty bounds.
 *
 * Attacks get FASTER (shorter windup/recovery) and projectiles get QUICKER as
 * the campaign progresses. Both are clamped: a windup below ~0.45s stops being
 * a telegraph the player can react to and becomes an unavoidable hit, which is
 * not difficulty. The floors here are what keep mission 12 hard rather than
 * unfair.
 */
export const DIFFICULTY = Object.freeze({
  FIRST_MISSION: 1,
  LAST_MISSION: 12,
  // multiplicative, applied to the boss's own base profile
  CADENCE_MIN: 0.55,          // windup/recovery at mission 12 (45% faster)
  PROJECTILE_SPEED_MAX: 1.65, // projectile speed at mission 12
  COUNT_MAX: 1.4,             // projectile count at mission 12
  MIN_WINDUP_SECONDS: 0.45,   // absolute reaction floor

  /* Guardian HEALTH across the campaign.
     ---------------------------------------------------------------------
     Until this existed, boss health had no relationship to campaign
     position — and the order was actually inverted. Measured:

       mission 1  Sunscar Colossus      1650 hp
       mission 5  Obsidian Demon Knight  480 hp
       mission 11 Arc Gunner             740 hp

     Meanwhile the player's special attack scales with rank — 120 as an
     Ensign, 155 as a Lieutenant, 195 as a Captain — so a Captain reached
     mission 5 and removed a Guardian in three specials. The rank reward is
     working as intended; nothing was rising to meet it.

     HEALTH_MIN/MAX is the campaign floor. IDENTITY_MIN/MAX bounds how far a
     Guardian's own bulk may pull it off that floor, so a Tremor still reads
     as heavier than a Siren without a first-mission boss outweighing a
     twelfth-mission one. */
  HEALTH_MIN: 0.85,           // campaign multiplier at mission 1
  HEALTH_MAX: 3.20,           // campaign multiplier at mission 12
  IDENTITY_MIN: 0.85,         // floor on a Guardian's own relative bulk
  IDENTITY_MAX: 1.30,         // ceiling on it
  HEALTH_REFERENCE: 740,      // the median base health the identity ratio is taken against
});

/**
 * Normalised campaign progress, 0 at mission 1 → 1 at mission 12.
 * Unknown missions are treated as mission 1 rather than as maximum difficulty:
 * failing safe here means an unmapped boss is easy, not impossible.
 */
export function difficultyProgress(missionIdOrNumber) {
  const n = typeof missionIdOrNumber === "number"
    ? missionIdOrNumber
    : missionNumber(missionIdOrNumber);
  const clamped = Math.max(DIFFICULTY.FIRST_MISSION, Math.min(DIFFICULTY.LAST_MISSION, n || 1));
  return (clamped - DIFFICULTY.FIRST_MISSION) / (DIFFICULTY.LAST_MISSION - DIFFICULTY.FIRST_MISSION);
}

const lerp = (a, b, t) => a + (b - a) * t;

/** The three scalars a Guardian encounter needs, for one mission. */
/**
 * Campaign health multiplier for a Guardian, 0.85 at mission 1 rising to 3.2
 * at mission 12. Paired with identityScale() below.
 */
export function healthScale(missionIdOrNumber) {
  const t = difficultyProgress(missionIdOrNumber);
  return DIFFICULTY.HEALTH_MIN + t * (DIFFICULTY.HEALTH_MAX - DIFFICULTY.HEALTH_MIN);
}

/**
 * How far a Guardian's own bulk may pull it off the campaign floor.
 *
 * Bounded deliberately. The Sunscar Colossus is naturally 2.2x the median and
 * the Obsidian Demon Knight 0.65x; left unbounded that spread swamps the
 * campaign curve and reproduces the inversion this replaces.
 */
export function identityScale(baseHealth) {
  const ratio = Number(baseHealth) / DIFFICULTY.HEALTH_REFERENCE;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.max(DIFFICULTY.IDENTITY_MIN, Math.min(DIFFICULTY.IDENTITY_MAX, ratio));
}

export function missionDifficulty(missionIdOrNumber) {
  const t = difficultyProgress(missionIdOrNumber);
  return Object.freeze({
    progress: t,
    cadenceScale: lerp(1, DIFFICULTY.CADENCE_MIN, t),          // ×windup, ×recovery
    projectileSpeedScale: lerp(1, DIFFICULTY.PROJECTILE_SPEED_MAX, t),
    projectileCountScale: lerp(1, DIFFICULTY.COUNT_MAX, t),
  });
}

/**
 * Apply campaign scaling to a boss attack profile.
 * Pure: returns a new frozen object and never mutates the base profile, so the
 * same boss refought in an earlier mission is not permanently harder.
 */
export function scaleAttackProfile(profile, missionIdOrNumber) {
  if (!profile) return profile;
  const d = missionDifficulty(missionIdOrNumber);
  const windup = Math.max(DIFFICULTY.MIN_WINDUP_SECONDS, (profile.windup ?? 1) * d.cadenceScale);
  const recovery = (profile.recovery ?? 2.25) * d.cadenceScale;
  return Object.freeze({
    ...profile,
    windup,
    recovery,
    cooldown: windup + recovery,
    difficultyProgress: d.progress,
  });
}

/**
 * Apply campaign scaling to a projectile pattern.
 * Only `speed` and `count`-like fields are touched; telegraph timing is left to
 * scaleAttackProfile so the warning window and the shot cadence cannot drift
 * apart and produce an untelegraphed volley.
 */
export function scaleProjectilePattern(pattern, missionIdOrNumber) {
  if (!pattern) return pattern;
  const d = missionDifficulty(missionIdOrNumber);
  const out = { ...pattern };
  if (typeof pattern.speed === "number") out.speed = round2(pattern.speed * d.projectileSpeedScale);
  for (const key of ["count", "countPhase1", "countPhase3", "countPerRing", "lanes"]) {
    if (typeof pattern[key] === "number") out[key] = Math.round(pattern[key] * d.projectileCountScale);
  }
  return Object.freeze(out);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A readable comparison of all twelve missions — what each delivers, to which
 * biomes, how many items, and how hard its Guardian is. Used by the test
 * suite and available for tooling; this is the "compare mission items"
 * artifact.
 */
export function compareMissions() {
  return PROJECT_LADDER.map((p, i) => {
    const items = missionItems(p.mission);
    const d = missionDifficulty(i + 1);
    return {
      n: i + 1,
      mission: p.mission,
      project: p.project,
      type: p.type,
      biomes: BIOMES.length,
      items: items.length,
      preparation: items.filter((x) => x.category === "preparation").length,
      construction: items.filter((x) => x.category === "construction").length,
      prepKind: p.prep,
      prepTarget: prepTargetFor(p.prep, i + 1),
      cadenceScale: round2(d.cadenceScale),
      projectileSpeedScale: round2(d.projectileSpeedScale),
    };
  });
}

export default {
  BIOMES, PROJECT_LADDER, ITEMS_PER_MISSION,
  missionItems, biomeAssignments, missionNumber, projectFor, campaignOrder,
  completedProjects, rankForInfrastructure,
  missionDifficulty, scaleAttackProfile, scaleProjectilePattern, compareMissions,
};
