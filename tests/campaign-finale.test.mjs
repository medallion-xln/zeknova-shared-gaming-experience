import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { PROJECT_LADDER, BIOMES } from "../src/game/CampaignPlan.js";
import { MISSION_OBJECTIVES } from "../src/game/Missions.js";
import { CampaignFinale, campaignComplete, finaleSummary, FINALE_STORAGE_KEY } from "../src/game/CampaignFinale.js";

let checks = 0;
const check = (label, cond) => { assert.ok(cond, label); checks++; };

check("the stylesheet ships", existsSync(new URL("../assets/campaign-finale.css", import.meta.url)));

/* A context in which every objective of every mission is satisfied. Built from
   the objectives themselves rather than hand-listed, so it cannot fall out of
   step with the campaign. */
function completedContext() {
  const biomes = {};
  for (const b of BIOMES) biomes[b] = { buildings: {}, stats: {}, resources: 99, visited: true };
  const ctx = { biomes, stats: {}, buildings: {}, missionStats: { bossDefeats: {} } };
  for (const plan of PROJECT_LADDER) {
    for (const o of MISSION_OBJECTIVES[plan.mission] ?? []) {
      const scope = o.biome ? (biomes[o.biome] ??= { buildings: {}, stats: {} }) : null;
      if (o.kind === "biomeBuilding" && scope) scope.buildings[o.key] = Math.max(scope.buildings[o.key] ?? 0, o.target);
      if (o.kind === "biomeEither" && scope) scope.buildings[o.keys[0]] = Math.max(scope.buildings[o.keys[0]] ?? 0, o.target);
      if (o.kind === "biomeResource" && scope) scope.resources = 99;
      if (o.kind === "biomeStat" && scope) { scope.stats ??= {}; scope.stats[o.key] = 99; }
      if (o.kind === "biomeVisit" && scope) scope.visited = true;
      if (o.kind === "boss") { ctx.missionStats.bossDefeats[o.bossId] = 1; ctx.bossDefeats ??= {}; ctx.bossDefeats[o.bossId] = 1; }
    }
  }
  return ctx;
}

check("an empty world is not a finished campaign", campaignComplete({ biomes: {}, stats: {} }) === false);
check("null context is not a finished campaign", campaignComplete(null) === false);

// ── summary ─────────────────────────────────────────────────────────────
const game = {
  gameId: "run-1",
  user: { officerClass: "captain" },
  missionStats: { bossDefeats: { a: 1, b: 1, c: 1 } },
  buildings: { records: [
    ...BIOMES.map((b) => ({ type: "power", biome: b, health: 100 })),
    { type: "water", biome: "forest", health: 100 },
    { type: "water", biome: "desert", health: 0 },      // rubble must not count
  ] },
};
const s = finaleSummary(game);
check("standing structures counted, rubble excluded", s.structures === 6);
check("a project completed in all five biomes is counted", s.projects === 1);
check("guardians counted", s.guardians === 3);
check("final rank reported", s.rank === "captain");
check("total projects is the ladder length", s.totalProjects === PROJECT_LADDER.length);

// ── the overlay, against a stub DOM ─────────────────────────────────────
const made = [];
const el = () => ({ children: [], dataset: {}, style: {}, classList: { add(){}, toggle(){} },
  setAttribute(k,v){ this[k]=v; }, getAttribute(k){ return this[k]; },
  append(...c){ this.children.push(...c); }, addEventListener(){}, removeEventListener(){},
  remove(){ this.removed = true; }, focus(){}, textContent: "" });
const doc = { createElement(){ const n = el(); made.push(n); return n; },
  body: el(), addEventListener(){}, removeEventListener(){} };
const store = (() => { let v = {}; return { getItem: k => v[k] ?? null, setItem: (k,x) => { v[k] = x; } }; })();
const win = { setInterval: () => 7, clearInterval: () => {}, matchMedia: () => ({ matches: false }) };

const finale = new CampaignFinale({ game, doc, storage: store, windowRef: win });
check("installs a poller", finale.install() === true);
check("nothing shown yet", finale.snapshot().shown === false);
check("shows once", finale.show(s) === true);
check("snapshot reports visible", finale.snapshot().visible === true);
check("a second show is refused", finale.show(s) === false);
check("the run is remembered", String(store.getItem(FINALE_STORAGE_KEY)).includes("run-1"));
check("it announces itself as a dialog", made.some(n => n.role === "dialog" && n["aria-modal"] === "true"));
check("the planet is named as ready", made.some(n => String(n.textContent).includes("ready for humans")));
finale.dismiss();
check("dismiss removes it", finale.snapshot().visible === false);

/* A second run gets its own ending — otherwise finishing again after a reset
   would silently show nothing. */
const finale2 = new CampaignFinale({ game: { ...game, gameId: "run-2" }, doc, storage: store, windowRef: win });
check("a different run has not been seen", finale2.alreadySeen() === false);
const finale3 = new CampaignFinale({ game, doc, storage: store, windowRef: win });
check("the same run is not shown twice", finale3.alreadySeen() === true);

// NEGATIVE CONTROL: storage that throws must not break the ending.
const hostile = { getItem(){ throw new Error("blocked"); }, setItem(){ throw new Error("blocked"); } };
const finale4 = new CampaignFinale({ game, doc, storage: hostile, windowRef: win });
check("blocked storage still allows the ending", finale4.alreadySeen() === false);
check("blocked storage still shows it", finale4.show(s) === true);
finale4.dismiss();

check("no document is a clean refusal",
  new CampaignFinale({ game, doc: null, storage: store, windowRef: win }).install() === false);

console.log(`Campaign finale tests passed (${checks} checks).`);
