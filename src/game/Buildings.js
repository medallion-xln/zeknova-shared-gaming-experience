export const OFFICER_TIERS = Object.freeze({ ensign: 1, lieutenant: 2, captain: 3 });

const rows = [
  ["power", "Solar Grid", "Planetary energy generation and distribution.", "ensign", { minerals: 24, iron: 8, biomass: 8, credits: 12 }, []],
  ["water", "Water Works", "Purifies and distributes water through the planetary utility network.", "ensign", { minerals: 20, iron: 6, biomass: 12, credits: 10 }, ["power"]],
  ["communications", "Quantum Communications Hub", "Provides the planet-wide data and civilian Wi-Fi backbone.", "ensign", { minerals: 28, iron: 10, energy: 8, credits: 18 }, ["power"]],
  ["habitat", "Habitat", "Permanent housing connected to light, water, and communications.", "ensign", { minerals: 28, iron: 10, biomass: 18, credits: 18 }, ["power", "water", "data"]],
  ["defense", "Defense Tower", "Protects settlements and relays early-warning coverage.", "ensign", { minerals: 34, iron: 14, energy: 10, credits: 20 }, ["power", "data"]],
  ["bridge", "Canopy Bridge", "Creates a permanent surface crossing.", "ensign", { minerals: 20, iron: 8, credits: 5 }, []],
  ["boat", "Survey Skiff", "Provides waterborne transport and survey access.", "ensign", { minerals: 30, iron: 12, credits: 8 }, ["power"]],
  ["capitol", "Regional Capitol", "Administers a regional population center.", "lieutenant", { minerals: 44, iron: 16, data: 12, credits: 34 }, ["power", "water", "data"]],
  ["hospital", "Planetary Hospital", "Provides trauma care, public health, and emergency response.", "lieutenant", { minerals: 40, iron: 14, biomass: 16, data: 8, credits: 30 }, ["power", "water", "data"]],
  ["university", "University Campus", "Educates specialists and expands research capacity.", "lieutenant", { minerals: 42, iron: 12, energy: 10, data: 10, credits: 32 }, ["power", "water", "data"]],
  ["transit", "Planetary Transit Hub", "Moves residents and cargo between regional capitals.", "lieutenant", { minerals: 46, iron: 18, energy: 12, credits: 32 }, ["power", "data"]],
  ["commerce", "Trade and Civic Center", "Supports markets, culture, diplomacy, and civilian commerce.", "lieutenant", { minerals: 38, iron: 10, biomass: 10, data: 8, credits: 30 }, ["power", "water", "data"]],
  ["planetary_capitol", "Planetary Capitol", "Coordinates the united government of ZekNova.", "lieutenant", { minerals: 60, iron: 22, data: 22, credits: 50 }, ["power", "water", "data"]],
  ["war_economy", "War Economy Complex", "Produces strategic materiel at significant social and diplomatic cost.", "captain", { minerals: 70, iron: 30, energy: 20, data: 16, credits: 60 }, ["power", "water", "data"]],
  ["defense_contractor", "Defense Contractor Campus", "Develops weapons, logistics, and planetary defense systems.", "captain", { minerals: 64, iron: 26, energy: 18, data: 20, credits: 70 }, ["power", "water", "data"]],
  ["corporate_hq", "Fortune 500 Headquarters", "Coordinates a planet-scale industrial corporation.", "captain", { minerals: 62, iron: 18, data: 24, credits: 80 }, ["power", "water", "data"]],
  ["stock_exchange", "ZekNova Stock Exchange", "Links planetary capital, investment, and corporate governance.", "captain", { minerals: 68, iron: 20, data: 30, credits: 90 }, ["power", "water", "data"]],
];

export const HUMAN_BUILDINGS = Object.freeze(Object.fromEntries(rows.map(([type, label, description, rank, cost, utilities]) => [type, Object.freeze({ type, label, description, rank, tier: OFFICER_TIERS[rank], cost: Object.freeze(cost), utilities: Object.freeze(utilities) })])));
export const HUMAN_BUILDING_TYPES = Object.freeze(Object.keys(HUMAN_BUILDINGS));

export function buildingUnlocked(type, rank = "ensign") {
  const building = HUMAN_BUILDINGS[type];
  return Boolean(building && (OFFICER_TIERS[rank] ?? 1) >= building.tier);
}
