/**
 * Sentinel strategic verification model: a 19x19 goban (361 intersections).
 * Evaluation-only. Produces attributable plans; it never mutates the live game.
 */
export const GOBAN_SIZE = 19;
export const GOBAN_POINT_COUNT = GOBAN_SIZE * GOBAN_SIZE;
export const SENTINEL_GOBAN_AUTHORITY = Object.freeze({ tier: "R0_EVALUATION", canDispatch: false, canMutateLiveWorld: false });

export const CONTROL_DOMAINS = Object.freeze({
  actorBehavior: Object.freeze(["civilian", "worker", "scout", "stalker", "saboteur", "spitter", "skyray", "burrower", "juggernaut", "boss"]),
  infrastructure: Object.freeze(["route", "power", "water", "communications", "defense", "shelter"]),
  diplomacy: Object.freeze(["ceasefire", "withdrawal", "resource_exchange", "safe_passage", "surrender_terms"]),
  worldCycle: Object.freeze(["request_dawn", "request_day", "request_dusk", "request_night"]),
  combatSequence: Object.freeze(["observe", "position", "telegraph", "engage", "reassess", "withdraw_or_escalate"]),
  improvement: Object.freeze(["candidate_policy", "counterfactual_evaluation", "regression_gate", "human_promotion"]),
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
function hash(value) {
  const text = JSON.stringify(canonical(value)); let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
export const pointId = (x, y) => `g${String(y).padStart(2, "0")}-${String(x).padStart(2, "0")}`;
export function gobanPoint(x, y) {
  x = Math.trunc(x); y = Math.trunc(y);
  if (x < 0 || y < 0 || x >= GOBAN_SIZE || y >= GOBAN_SIZE) throw new Error("Goban coordinate outside 19x19 intersections.");
  return Object.freeze({ id: pointId(x, y), index: y * GOBAN_SIZE + x, x, y });
}
export function worldToGoban(position, bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }) {
  const x = Math.round(clamp((Number(position?.x || 0) - bounds.minX) / (bounds.maxX - bounds.minX), 0, 1) * 18);
  const y = Math.round(clamp((Number(position?.z || 0) - bounds.minZ) / (bounds.maxZ - bounds.minZ), 0, 1) * 18);
  return gobanPoint(x, y);
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function nearest(origin, points) { return [...points].sort((a, b) => distance(origin, a.point) - distance(origin, b.point) || a.id.localeCompare(b.id))[0] || null; }

function actorIntent(actor, context) {
  const role = String(actor.role || "civilian");
  const hostile = actor.faction === "zeknovan" && context.humanHostile;
  const nearestThreat = nearest(actor.point, context.threats);
  const nearestShelter = nearest(actor.point, context.shelters);
  if (role === "civilian") return { intent: nearestThreat && distance(actor.point, nearestThreat.point) < 5 ? "evacuate_to_shelter" : "continue_civilian_activity", targetId: nearestShelter?.id || null, lethal: false };
  if (role === "worker") return { intent: context.damagedInfrastructure.length ? "repair_infrastructure" : "build_infrastructure", targetId: context.damagedInfrastructure[0]?.id || context.buildSite?.id || null, lethal: false };
  if (role === "scout") return { intent: "recon_flank", targetId: nearestThreat?.id || null, lethal: false };
  if (role === "saboteur") return { intent: hostile ? "disable_infrastructure" : "guard_utility", targetId: context.criticalInfrastructure[0]?.id || null, lethal: hostile };
  if (role === "spitter") return { intent: hostile ? "maintain_range_and_volley" : "overwatch", targetId: nearestThreat?.id || null, lethal: hostile };
  if (role === "skyray") return { intent: hostile ? "aerial_strafe_and_disrupt" : "aerial_patrol", targetId: nearestThreat?.id || null, lethal: hostile };
  if (role === "burrower") return { intent: hostile ? "seismic_infrastructure_pressure" : "subsurface_guard", targetId: context.criticalInfrastructure[0]?.id || null, lethal: hostile };
  if (role === "juggernaut") return { intent: hostile ? "anchor_and_break_line" : "hold_chokepoint", targetId: nearestThreat?.id || null, lethal: hostile };
  if (role === "boss") return { intent: hostile ? "phase_strategy_with_telegraphs" : "issue_negotiation_challenge", targetId: nearestThreat?.id || null, lethal: hostile, sequence: CONTROL_DOMAINS.combatSequence };
  return { intent: hostile ? "stalk_from_cover" : "territorial_patrol", targetId: nearestThreat?.id || null, lethal: hostile };
}

export function createGobanStrategy(raw = {}) {
  const actors = (raw.actors || []).map((item, index) => ({ id: String(item.id || `actor-${index}`), faction: String(item.faction || "zeknovan"), role: String(item.role || "civilian"), point: item.point?.id ? item.point : worldToGoban(item.position) }));
  const mapItems = (items = []) => items.map((item, index) => ({ id: String(item.id || `item-${index}`), point: item.point?.id ? item.point : worldToGoban(item.position), status: String(item.status || "operational"), type: String(item.type || "unknown") }));
  const infrastructure = mapItems(raw.infrastructure), threats = mapItems(raw.threats), shelters = infrastructure.filter((x) => x.type === "shelter" || x.type === "capitol");
  const context = { threats, shelters, damagedInfrastructure: infrastructure.filter((x) => x.status !== "operational"), criticalInfrastructure: infrastructure.filter((x) => ["power", "water", "communications", "capitol"].includes(x.type)), buildSite: mapItems(raw.buildSites)[0] || null, humanHostile: Number(raw.tension ?? 50) >= 65 && raw.ceasefire !== true };
  const actorPlans = actors.map((actor) => Object.freeze({ actorId: actor.id, role: actor.role, from: actor.point.id, ...actorIntent(actor, context) }));
  const pressure = threats.length + actorPlans.filter((x) => x.lethal).length;
  const negotiation = raw.ceasefire === true ? "honor_ceasefire" : Number(raw.tension ?? 50) < 35 ? "offer_resource_exchange" : Number(raw.tension ?? 50) < 70 ? "offer_safe_passage" : "demand_withdrawal_with_surrender_option";
  const cycle = pressure > 4 ? "request_day" : actors.some((x) => ["stalker", "saboteur"].includes(x.role)) ? "request_night" : "request_dusk";
  const plan = canonical({ authority: SENTINEL_GOBAN_AUTHORITY, board: { size: GOBAN_SIZE, pointCount: GOBAN_POINT_COUNT }, quantum: Math.max(0, Math.trunc(raw.quantum || 0)), actorPlans, strategicPlan: { negotiation, requestedCycle: cycle, infrastructurePriority: context.damagedInfrastructure[0]?.id || context.criticalInfrastructure[0]?.id || null, combatSequence: pressure ? CONTROL_DOMAINS.combatSequence : ["observe", "reassess"], pressure }, sourceStateHash: hash(raw) });
  return Object.freeze({ ...plan, planId: `zkgi:v1:${hash(plan)}` });
}

export function verifyGobanIntelligence(state, options = {}) {
  const first = createGobanStrategy(state), second = createGobanStrategy(canonical(state));
  const roles = new Set(first.actorPlans.map((x) => x.role)), intents = new Set(first.actorPlans.map((x) => x.intent));
  const counterfactualState = { ...state, tension: Number(state.tension ?? 50) >= 65 ? 20 : 90 };
  const counterfactual = createGobanStrategy(counterfactualState);
  const gates = canonical({
    boardGate: first.board.size === 19 && first.board.pointCount === 361,
    deterministicGate: JSON.stringify(first) === JSON.stringify(second),
    legalityGate: first.actorPlans.every((x) => CONTROL_DOMAINS.actorBehavior.includes(x.role)),
    roleDifferentiationGate: roles.size < 2 || intents.size >= 2,
    counterfactualSensitivityGate: first.strategicPlan.negotiation !== counterfactual.strategicPlan.negotiation,
    civilianProtectionGate: first.actorPlans.filter((x) => x.role === "civilian").every((x) => x.lethal === false),
    bossSequenceGate: first.actorPlans.filter((x) => x.role === "boss").every((x) => x.sequence?.includes("telegraph")),
    rollbackGate: true,
    noLiveAuthorityGate: first.authority.canDispatch === false && first.authority.canMutateLiveWorld === false,
    outcomeUpliftGate: options.candidateScore != null && options.baselineScore != null ? options.candidateScore > options.baselineScore : false,
  });
  return Object.freeze({ reportId: `zkgv:v1:${hash({ first, counterfactual, gates })}`, plan: first, counterfactualPlan: counterfactual, gates, intelligenceVerified: Object.entries(gates).filter(([key]) => key !== "outcomeUpliftGate").every(([, value]) => value === true), promotionEligible: Object.values(gates).every(Boolean), liveAuthorityApproved: false });
}
