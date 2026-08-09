import { forestDefensiveCommandContractV2 } from "../world/ForestDefensiveCommandsV2.js";
import "../../azl/zeknova-forest-defensive-command-adapter-v2.js";

const I = () => globalThis.ZekNovaIdentityContract;
const F = () => globalThis.ZekNovaForestDefensiveActionContract;
const AUTHORITY_CAPABILITIES = new WeakMap();
const INTERCEPT_RANGE = 2;

const clone = (value) => I().stableClone(value);
const cell = (position) => ({ x: Math.round(Number(position?.x || 0)), y: Math.round(Number(position?.y || 0)), z: Math.round(Number(position?.z || 0)) });
const distanceXZ = (a, b) => Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.z || 0) - Number(b?.z || 0));
const terminal = (status) => ["completed", "failed", "interrupted"].includes(status);

function positionRef(object) {
  if (!object) return null;
  if (object.position && typeof object.position === "object") return object.position;
  if (typeof object.x === "number" && typeof object.z === "number") return object;
  return null;
}
function setPosition(object, target) {
  const ref = positionRef(object);
  if (!ref) throw new Error("Live command assignment has no mutable position.");
  if (typeof ref.set === "function") ref.set(target.x, target.y, target.z);
  else { ref.x = target.x; ref.y = target.y; ref.z = target.z; }
}
function ensureUserData(object) {
  if (!object || typeof object !== "object") return {};
  if (!object.userData || typeof object.userData !== "object") object.userData = {};
  return object.userData;
}

export class ForestDefensiveCommandIntegrationV2 {
  constructor({ game, identityIntegration, forestActionIntegration, perceptionIntegration = null, knowledgeIntegration = null, relationsPanel = null, quantumProvider = null, initialReadiness = 60, initialMaterials = 100 } = {}) {
    if (!game) throw new Error("ForestDefensiveCommandIntegrationV2 requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("ForestDefensiveCommandIntegrationV2 requires W0-O.0 IdentityIntegration.");
    if (!forestActionIntegration?.captureForFaction) throw new Error("ForestDefensiveCommandIntegrationV2 requires W0-AF ForestDefensiveActionIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.forestActionIntegration = forestActionIntegration;
    this.perceptionIntegration = perceptionIntegration;
    this.knowledgeIntegration = knowledgeIntegration;
    this.relationsPanel = relationsPanel;
    this.quantumProvider = quantumProvider || (() => Number(game.perceptionQuantum || 0));
    this.initialReadiness = Math.max(0, Math.trunc(initialReadiness));
    this.initialMaterials = Math.max(0, Math.trunc(initialMaterials));
    this.currentQuantum = Math.max(0, Math.trunc(this.quantumProvider()));
    this.commandSequence = 0;
    this.commands = new Map();
    this.runtime = new Map();
    this.patrols = new Map();
    this.repairCrews = new Map();
    this.routes = new Map();
    this.structures = new Map();
    this.resources = new Map();
    this.infrastructure = new Map();
    this.factionAgents = new Map();
    this.readiness = new Map();
    this.materials = new Map();
    this.cooldowns = new Map();
    this.activeByFaction = new Map();
    this.ledger = new (forestDefensiveCommandContractV2().CommandEventLedger)();
    this.installed = false;
    this.controller = null;
    this.previousController = null;
    AUTHORITY_CAPABILITIES.set(this, Object.freeze({ runtime: "w0p2-incumbent-capability" }));
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    this.registerFactionAgent({ factionId: this.identityIntegration.humanFactionId, object: this.game.player?.group });
    for (const item of this.game.forestPatrols || []) this.registerPatrol(item);
    for (const item of this.game.forestRepairCrews || []) this.registerRepairCrew(item);
    this.discoverLiveSubjects();
    const runtime = this;
    this.previousController = globalThis.ZekNovaIncumbentForestCommandController || null;
    this.controller = Object.freeze({
      id: "zeknova-incumbent-forest-command-controller-v2",
      authoritySource: forestDefensiveCommandContractV2().REQUIRED_AUTHORITY,
      supportedActionIndexes: forestDefensiveCommandContractV2().SUPPORTED_ACTION_INDEXES,
      issue: (options) => runtime.issueCommand({ ...(options || {}), authoritySource: forestDefensiveCommandContractV2().REQUIRED_AUTHORITY, authorityCapability: AUTHORITY_CAPABILITIES.get(runtime) }),
      advanceToQuantum: (quantum) => runtime.advanceToQuantum(quantum),
      registerPatrol: (options) => runtime.registerPatrol(options),
      registerRepairCrew: (options) => runtime.registerRepairCrew(options),
      registerRoute: (options) => runtime.registerRoute(options),
      registerStructure: (options) => runtime.registerStructure(options),
      registerResource: (options) => runtime.registerResource(options),
      registerInfrastructure: (options) => runtime.registerInfrastructure(options),
      registerFactionAgent: (options) => runtime.registerFactionAgent(options),
      getCommand: (commandId) => runtime.getCommand(commandId),
      captureRuntimeSnapshot: () => runtime.captureRuntimeSnapshot(),
    });
    globalThis.ZekNovaForestDefensiveCommandIntegrationV2 = this;
    globalThis.ZekNovaIncumbentForestCommandControllerV2 = this.controller;
    globalThis.ZekNovaIncumbentForestCommandController = this.controller;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaForestCommands = "w0p2-v2";
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      const C = forestDefensiveCommandContractV2();
      globalThis.dispatchEvent(new CustomEvent("zeknova:forest-command-runtime-v2-ready", { detail: { commandSpaceId: C.COMMAND_SPACE_ID, mode: C.MODE, requiredAuthority: C.REQUIRED_AUTHORITY, supportedActionIndexes: C.SUPPORTED_ACTION_INDEXES } }));
    }
    return this;
  }

  createId(prefix, body) { return `${prefix}:${I().hash64x2(body)}`; }
  readinessFor(factionId) { if (!this.readiness.has(factionId)) this.readiness.set(factionId, this.initialReadiness); return this.readiness.get(factionId); }
  materialsFor(factionId) {
    if (!this.materials.has(factionId)) {
      const live = Number(this.game.simulation?.resources?.minerals);
      this.materials.set(factionId, Number.isFinite(live) ? Math.max(0, Math.trunc(live)) : this.initialMaterials);
    }
    return this.materials.get(factionId);
  }
  setMaterials(factionId, value) {
    const next = Math.max(0, Math.trunc(value)); this.materials.set(factionId, next);
    if (factionId === this.identityIntegration.humanFactionId && this.game.simulation?.resources) this.game.simulation.resources.minerals = next;
  }

  registerFactionAgent(raw = {}) {
    const factionId = raw.factionId || this.identityIntegration.humanFactionId;
    if (!raw.object) return null;
    I().assertCanonicalIdentity(factionId, "factionId");
    this.factionAgents.set(factionId, raw.object);
    return factionId;
  }
  registerPatrol(raw = {}) {
    const factionId = raw.factionId || this.identityIntegration.humanFactionId; I().assertCanonicalIdentity(factionId, "factionId");
    const object = raw.object || raw.group || raw; const ref = positionRef(object); if (!ref) throw new Error("Forest patrol registration requires a live position object.");
    const ordinal = [...this.patrols.values()].filter((p) => p.factionId === factionId).length;
    const patrolId = String(raw.patrolId || object.userData?.patrolId || this.createId("zkpatrol:v1", { factionId, ordinal, worldId: this.identityIntegration.worldId }));
    if (!/^zkpatrol:v1:[0-9a-f]{16}$/.test(patrolId)) throw new Error("Invalid patrolId.");
    const homePosition = cell(raw.homePosition || raw.home || ref); const data = ensureUserData(object); data.patrolId = patrolId; data.factionId = factionId;
    const record = { patrolId, factionId, object, homePosition, reservedByCommandId: null, status: "available" }; this.patrols.set(patrolId, record); return this.publicAssignment(record, "patrol");
  }
  registerRepairCrew(raw = {}) {
    const factionId = raw.factionId || this.identityIntegration.humanFactionId; I().assertCanonicalIdentity(factionId, "factionId");
    const object = raw.object || raw.group || raw; const ref = positionRef(object); if (!ref) throw new Error("Repair crew registration requires a live position object.");
    const ordinal = [...this.repairCrews.values()].filter((p) => p.factionId === factionId).length;
    const repairCrewId = String(raw.repairCrewId || object.userData?.repairCrewId || this.createId("zkrepair:v1", { factionId, ordinal, worldId: this.identityIntegration.worldId }));
    if (!/^zkrepair:v1:[0-9a-f]{16}$/.test(repairCrewId)) throw new Error("Invalid repairCrewId.");
    const homePosition = cell(raw.homePosition || raw.home || ref); const data = ensureUserData(object); data.repairCrewId = repairCrewId; data.factionId = factionId;
    const record = { repairCrewId, factionId, object, homePosition, reservedByCommandId: null, status: "available" }; this.repairCrews.set(repairCrewId, record); return this.publicAssignment(record, "repair");
  }
  publicAssignment(record, kind) { const idKey = kind === "patrol" ? "patrolId" : "repairCrewId"; return I().canonicalize({ factionId: record.factionId, homePosition: record.homePosition, [idKey]: record[idKey], position: cell(positionRef(record.object)), reservedByCommandId: record.reservedByCommandId, status: record.status }); }
  patrolsFor(factionId) { return [...this.patrols.values()].filter((p) => p.factionId === factionId); }
  crewsFor(factionId) { return [...this.repairCrews.values()].filter((p) => p.factionId === factionId); }
  availablePatrolsFor(factionId) { return this.patrolsFor(factionId).filter((p) => p.reservedByCommandId == null); }
  availableCrewsFor(factionId) { return this.crewsFor(factionId).filter((p) => p.reservedByCommandId == null); }

  registerSubject(map, raw, kind) {
    const subjectId = String(raw.subjectId || raw.entityId || raw.object?.userData?.entityId || "");
    I().assertCanonicalIdentity(subjectId, `${kind} subjectId`);
    const object = raw.object || raw.record || raw;
    const position = cell(raw.position || positionRef(object) || raw.observedPosition || { x: 0, y: 0, z: 0 });
    const record = { subjectId, kind, object, position, status: String(raw.status || raw.statusBand || object?.status || object?.userData?.status || "unknown") };
    map.set(subjectId, record); return clone({ subjectId, kind, position, status: record.status });
  }
  registerRoute(raw = {}) { return this.registerSubject(this.routes, raw, "route"); }
  registerStructure(raw = {}) { return this.registerSubject(this.structures, raw, "structure"); }
  registerResource(raw = {}) { return this.registerSubject(this.resources, raw, "resource"); }
  registerInfrastructure(raw = {}) { return this.registerSubject(this.infrastructure, raw, "infrastructure"); }

  discoverLiveSubjects() {
    const snapshot = this.identityIntegration.captureSnapshot();
    for (const entity of snapshot.entities || []) {
      if (entity.kind === "route" && !this.routes.has(entity.entityId)) this.registerRoute({ subjectId: entity.entityId, position: entity.metadata?.position || { x: 0, y: 0, z: 0 }, status: "open", object: { userData: { entityId: entity.entityId }, position: entity.metadata?.position || { x: 0, y: 0, z: 0 } } });
      if (entity.kind === "structure" && !this.structures.has(entity.entityId)) {
        const sourceId = String(entity.sourceKey || "").replace(/^structure:/, "");
        const live = (this.game.buildings?.records || []).find((r) => String(r.id) === sourceId);
        if (live) this.registerStructure({ subjectId: entity.entityId, object: live, position: live, status: live.statusBand || live.status || "operational" });
      }
    }
    for (const collection of [this.game.terrain?.harvestableTrees, this.game.terrain?.powerUpNodes, this.game.terrain?.mineableRocks, this.game.terrain?.resourceNodes]) {
      for (const object of collection || []) if (object?.userData?.entityId && !this.resources.has(object.userData.entityId)) this.registerResource({ subjectId: object.userData.entityId, object, position: object.position, status: "available" });
    }
    for (const item of this.game.forestInfrastructure || []) if (item?.subjectId || item?.userData?.entityId) this.registerInfrastructure({ subjectId: item.subjectId || item.userData.entityId, object: item, position: item.position, status: item.status || item.userData?.status || "operational" });
  }

  lifecycleFor(factionId, quantum) {
    const cooldown = new Array(F().ACTION_COUNT).fill(0); const byAction = this.cooldowns.get(factionId) || new Map(); for (const [index, until] of byAction) cooldown[index] = Math.max(0, Number(until) - quantum);
    const execution = new Array(F().ACTION_COUNT).fill(0); const activeId = this.activeByFaction.get(factionId) || null; const active = activeId ? this.commands.get(activeId) : null; let activeActionIndex = -1, commitment = 0;
    if (active?.status === "active") { activeActionIndex = active.actionIndex; execution[active.actionIndex] = active.executionQuantaRemaining; commitment = Math.min(F().ACTIONS[active.actionIndex].cost.commitmentQuanta, active.executionQuantaRemaining); }
    return { activeActionIndex, commitmentQuantaRemaining: commitment, cooldownQuantaRemaining: cooldown, executionQuantaRemaining: execution };
  }
  captureCommandContext(factionId, options = {}) {
    const quantum = options.quantum == null ? this.currentQuantum : Math.trunc(options.quantum);
    return this.forestActionIntegration.captureForFaction(factionId, { quantum, capacities: { materials: this.materialsFor(factionId), patrolSlots: this.patrolsFor(factionId).length, readiness: this.readinessFor(factionId), repairCrewSlots: this.crewsFor(factionId).length }, capacitySource: "w0p2-live-command-runtime-v2", lifecycle: this.lifecycleFor(factionId, quantum), terminal: options.terminal ?? false, replanBoundary: options.replanBoundary ?? false });
  }

  targetDetails(bundle, actionIndex, targetId) {
    const action = F().ACTIONS[actionIndex]; if (!action.requiresTarget) { if (targetId != null) throw new Error("Targetless action cannot carry targetId."); return { target: null, slot: null, targetPosition: null }; }
    const entry = bundle.candidateSet.entries[actionIndex]; const target = entry?.targets?.find((item) => item.targetId === targetId); if (!target) throw new Error("Target is not canonical for live candidate set.");
    const section = bundle.observation.sections.find((item) => item.topic === target.topic); const slot = section?.slots?.[target.slotIndex]; if (!slot || slot.recordId !== target.recordId || slot.subjectId !== target.subjectId) throw new Error("Target slot does not match canonical observation.");
    const facts = slot.facts || {}; const position = facts.positionCell || facts.observedCell || facts.lastKnownPositionCell || null;
    return { target: clone(target), slot: clone(slot), targetPosition: position ? cell(position) : null };
  }

  resolveAssignments(factionId, actionIndex, options = {}) {
    const def = forestDefensiveCommandContractV2().COMMAND_DEFINITIONS[actionIndex]; let patrol = null, crew = null;
    if (def.assignmentMode === "reuse-patrol") {
      const activeId = this.activeByFaction.get(factionId); const active = activeId ? this.commands.get(activeId) : null; if (!active || active.status !== "active" || !active.patrolId) throw new Error("withdraw_exposed_patrol requires an active patrol-based command.");
      patrol = this.patrols.get(options.patrolId || active.patrolId); if (!patrol || patrol.reservedByCommandId !== active.commandId) throw new Error("Active patrol assignment is unavailable for withdrawal.");
    } else if (["patrol", "patrol-and-repair"].includes(def.assignmentMode)) {
      patrol = options.patrolId ? this.patrols.get(options.patrolId) : this.availablePatrolsFor(factionId)[0]; if (!patrol || patrol.factionId !== factionId || patrol.reservedByCommandId != null) throw new Error("No live patrol slot is available.");
    }
    if (["repair", "patrol-and-repair"].includes(def.assignmentMode)) {
      crew = options.repairCrewId ? this.repairCrews.get(options.repairCrewId) : this.availableCrewsFor(factionId)[0]; if (!crew || crew.factionId !== factionId || crew.reservedByCommandId != null) throw new Error("No live repair crew is available.");
    }
    return { patrol, crew };
  }

  interruptActive(factionId, newCommandId, quantum, keepPatrolId = null) {
    const activeId = this.activeByFaction.get(factionId); if (!activeId) return null; const previous = this.commands.get(activeId); if (!previous || previous.status !== "active") return null;
    const C = forestDefensiveCommandContractV2(); const interrupted = C.advanceCommand(previous, { quantum, interruptedByCommandId: newCommandId, observedEffects: ["assignment_interrupted_by_incumbent_command"] }); this.commands.set(activeId, interrupted); this.ledger.append(interrupted); this.finalizeCommand(interrupted, { keepPatrolId }); return interrupted;
  }

  issueCommand(options = {}) {
    if (!this.installed) throw new Error("ForestDefensiveCommandIntegrationV2 is not installed."); const C = forestDefensiveCommandContractV2();
    if (options.authoritySource !== C.REQUIRED_AUTHORITY) throw new Error("Live command authority must be incumbent-scripted-ai."); if (options.authorityCapability !== AUTHORITY_CAPABILITIES.get(this)) throw new Error("Live command requires the incumbent runtime capability.");
    const factionId = options.factionId || this.identityIntegration.humanFactionId; const quantum = options.quantum == null ? Math.max(this.currentQuantum, Math.trunc(this.quantumProvider())) : Math.trunc(options.quantum); if (quantum < this.currentQuantum) throw new Error("Live command quantum cannot move backward."); if (quantum > this.currentQuantum) this.advanceToQuantum(quantum);
    const actionIndex = Math.trunc(options.actionIndex); if (!C.SUPPORTED_ACTION_INDEXES.includes(actionIndex)) throw new Error("Action is outside W0-P.2 command space.");
    const bundle = this.captureCommandContext(factionId, { quantum, terminal: options.terminal, replanBoundary: options.replanBoundary }); const details = this.targetDetails(bundle, actionIndex, options.targetId); const assignments = this.resolveAssignments(factionId, actionIndex, options);
    const request = C.createCommandRequest({ worldId: bundle.observation.worldId, factionId, observationId: bundle.observation.observationId, planningStateId: bundle.state.stateId, candidateSetId: bundle.candidateSet.candidateSetId, actionIndex, targetId: options.targetId ?? null, patrolId: assignments.patrol?.patrolId || null, repairCrewId: assignments.crew?.repairCrewId || null, recipientFactionId: options.recipientFactionId ?? null, issuedAtQuantum: quantum, authoritySource: options.authoritySource, commandSequence: ++this.commandSequence });
    if ([0,12].includes(actionIndex)) this.interruptActive(factionId, request.commandId, quantum, actionIndex === 12 ? assignments.patrol?.patrolId : null);
    const before = { materials: this.materialsFor(factionId), patrolSlots: this.patrolsFor(factionId).length, readiness: this.readinessFor(factionId), repairCrewSlots: this.availableCrewsFor(factionId).length };
    let accepted = C.createAcceptedCommand({ request, observation: bundle.observation, planningState: bundle.state, candidateSet: bundle.candidateSet, acceptedAtQuantum: quantum, beforeCapacities: before });
    this.readiness.set(factionId, accepted.afterCapacities.readiness); this.setMaterials(factionId, accepted.afterCapacities.materials);
    if (assignments.patrol) { assignments.patrol.reservedByCommandId = request.commandId; assignments.patrol.status = actionIndex === 12 ? "withdrawing" : (actionIndex === 3 ? "intercepting" : "assigned"); }
    if (assignments.crew) { assignments.crew.reservedByCommandId = request.commandId; assignments.crew.status = "assigned"; }
    accepted = C.startCommand(accepted, quantum); this.commands.set(accepted.commandId, accepted); this.runtime.set(accepted.commandId, { target: details.target, slot: details.slot, targetPosition: details.targetPosition, stage: 0 }); this.activeByFaction.set(factionId, accepted.commandId); this.ledger.append(accepted);
    return clone({ bundle, command: accepted, patrol: assignments.patrol ? this.publicAssignment(assignments.patrol, "patrol") : null, repairCrew: assignments.crew ? this.publicAssignment(assignments.crew, "repair") : null });
  }

  liveEnemy(subjectId) { return this.identityIntegration.trackedEnemies?.get(subjectId) || (this.game.enemies || []).find((item) => item?.userData?.entityId === subjectId) || null; }
  liveRecordFor(target) {
    if (!target) return null; const maps = { route_status: this.routes, structure_status: this.structures, resource_location: this.resources, infrastructure_status: this.infrastructure }; const map = maps[target.topic]; return map?.get(target.subjectId) || null;
  }
  moveAssignment(record, position) { if (record && position) setPosition(record.object, position); }
  updateLiveStatus(record, status, effects = {}) { if (!record) return; record.status = status; if (record.object && typeof record.object === "object") { record.object.status = status; const data = ensureUserData(record.object); data.status = status; Object.assign(data, effects); } }

  complete(command, quantum, signal, effects) { return forestDefensiveCommandContractV2().advanceCommand(command, { quantum, completionSignal: signal, observedEffects: effects }); }
  fail(command, quantum, reason, effects = []) { return forestDefensiveCommandContractV2().advanceCommand(command, { quantum, failureReason: reason, observedEffects: effects }); }
  advanceOnly(command, quantum, effects) { return forestDefensiveCommandContractV2().advanceCommand(command, { quantum, observedEffects: effects }); }

  processActiveCommand(command, quantum) {
    const run = this.runtime.get(command.commandId); if (!run) return this.fail(command, quantum, "runtime_assignment_missing");
    const patrol = command.patrolId ? this.patrols.get(command.patrolId) : null; const crew = command.repairCrewId ? this.repairCrews.get(command.repairCrewId) : null; const live = this.liveRecordFor(run.target);
    switch (command.actionIndex) {
      case 0: this.readiness.set(command.factionId, Math.min(100, this.readinessFor(command.factionId) + 6)); return this.complete(command, quantum, "perimeter_hold_completed", ["settlement_perimeter_held","readiness_recovered"]);
      case 1:
        if (run.stage++ === 0) { this.moveAssignment(patrol, run.targetPosition); return this.advanceOnly(command, quantum, ["patrol_reached_route_endpoint"]); }
        this.moveAssignment(patrol, patrol.homePosition); return this.complete(command, quantum, "route_patrol_circuit_completed", ["patrol_reached_route_endpoint","patrol_returned_to_defensive_origin"]);
      case 2:
        if (run.stage++ === 0) { this.moveAssignment(patrol, run.targetPosition); return this.advanceOnly(command, quantum, ["forest_lane_recon_started"]); }
        if (live) { live.lastReconQuantum = quantum; this.updateLiveStatus(live, live.status === "unknown" ? "surveyed" : live.status, { lastReconQuantum: quantum }); }
        this.moveAssignment(patrol, patrol.homePosition); return this.complete(command, quantum, "forest_lane_recon_completed", ["route_recon_recorded","patrol_returned_to_defensive_origin"]);
      case 3: {
        const enemy = this.liveEnemy(run.target.subjectId); if (!enemy || Number(enemy.userData?.health || 0) <= 0) return this.complete(command, quantum, "hostile_contact_retired", ["hostile_contact_no_longer_active"]);
        this.moveAssignment(patrol, cell(positionRef(enemy))); if (distanceXZ(positionRef(patrol.object), positionRef(enemy)) <= INTERCEPT_RANGE) return this.complete(command, quantum, "patrol_entered_intercept_range", ["patrol_entered_intercept_range"]); return this.fail(command, quantum, "intercept_range_not_reached", ["patrol_advanced_toward_contact"]);
      }
      case 4: this.moveAssignment(patrol, run.targetPosition); return this.complete(command, quantum, "combat_alert_screened", ["patrol_screened_alert_position"]);
      case 5:
        if (!live) return this.fail(command, quantum, "live_structure_unavailable");
        if (run.stage++ === 0) { this.moveAssignment(patrol, run.targetPosition); return this.advanceOnly(command, quantum, ["patrol_reached_threatened_structure"]); }
        this.updateLiveStatus(live, live.status, { reinforcedUntilQuantum: quantum + 4, reinforcementActive: true }); return this.complete(command, quantum, "structure_reinforcement_completed", ["structure_reinforcement_activated"]);
      case 6:
        if (!live) return this.fail(command, quantum, "live_structure_unavailable");
        this.moveAssignment(crew, run.targetPosition); run.stage += 1; if (run.stage < 3) return this.advanceOnly(command, quantum, ["structure_repair_progressed"]);
        this.updateLiveStatus(live, "operational", { health: 100, statusBand: "operational" }); if (live.object) { live.object.health = Math.max(100, Number(live.object.health || 0)); live.object.statusBand = "operational"; }
        return this.complete(command, quantum, "structure_repair_completed", ["structure_restored_operational"]);
      case 7:
        if (!live) return this.fail(command, quantum, "live_route_unavailable");
        this.moveAssignment(patrol, run.targetPosition); this.moveAssignment(crew, run.targetPosition); run.stage += 1; if (run.stage < 3) return this.advanceOnly(command, quantum, ["route_fortification_progressed"]);
        this.updateLiveStatus(live, "open", { fortified: true, fortificationQuantum: quantum }); return this.complete(command, quantum, "route_fortification_completed", ["route_fortified","route_status_open"]);
      case 8:
        if (!live) return this.fail(command, quantum, "live_resource_unavailable");
        this.moveAssignment(patrol, run.targetPosition); if (run.stage++ === 0) return this.advanceOnly(command, quantum, ["patrol_reached_resource_location"]);
        this.updateLiveStatus(live, "secured", { securedByFactionId: command.factionId, securedAtQuantum: quantum }); return this.complete(command, quantum, "resource_security_established", ["resource_marked_secured"]);
      case 9:
        if (!live) return this.fail(command, quantum, "live_infrastructure_unavailable");
        this.moveAssignment(crew, run.targetPosition); if (run.stage++ === 0) return this.advanceOnly(command, quantum, ["infrastructure_stabilization_started"]);
        this.updateLiveStatus(live, "operational", { stabilizedAtQuantum: quantum }); return this.complete(command, quantum, "infrastructure_stabilized", ["infrastructure_status_operational"]);
      case 10: {
        if (!this.perceptionIntegration?.shareEvent || !this.knowledgeIntegration?.recordsForFaction) return this.fail(command, quantum, "intelligence_sharing_runtime_unavailable");
        const record = this.knowledgeIntegration.recordsForFaction(command.factionId, { includeStale: false }).find((r) => r.recordId === run.target.recordId); const evidence = record?.currentEvidence?.acquisitionMode === "direct" ? record.currentEvidence : null; const sender = this.factionAgents.get(command.factionId);
        if (!record || !evidence || !sender) return this.fail(command, quantum, "direct_intelligence_evidence_unavailable");
        this.perceptionIntegration.shareEvent({ originalEventId: evidence.sourceEventId, sender, recipientFactionId: command.recipientFactionId, observedAtQuantum: quantum, shareMode: "direct" });
        return this.complete(command, quantum, "intelligence_share_delivered", ["direct_intelligence_shared"]);
      }
      case 11:
        if (this.relationsPanel?.recordDelta) this.relationsPanel.recordDelta({ tension: -10, trust: 8, reason: "Open Defensive Diplomatic Channel" });
        else { this.game.diplomacyTension = Math.max(0, Number(this.game.diplomacyTension ?? 50) - 10); if (this.game.simulation?.resources) this.game.simulation.resources.trust = Math.min(100, Number(this.game.simulation.resources.trust ?? 50) + 8); }
        return this.complete(command, quantum, "defensive_channel_opened", ["defensive_diplomatic_channel_opened"]);
      case 12: this.moveAssignment(patrol, patrol.homePosition); this.readiness.set(command.factionId, Math.min(100, this.readinessFor(command.factionId) + 8)); return this.complete(command, quantum, "patrol_entered_defensive_return_zone", ["patrol_returned_to_defensive_origin","readiness_recovered"]);
      default: return this.fail(command, quantum, "unsupported_runtime_action");
    }
  }

  finalizeCommand(command, options = {}) {
    const patrol = command.patrolId ? this.patrols.get(command.patrolId) : null; if (patrol && patrol.patrolId !== options.keepPatrolId) { patrol.reservedByCommandId = null; patrol.status = "available"; }
    const crew = command.repairCrewId ? this.repairCrews.get(command.repairCrewId) : null; if (crew) { crew.reservedByCommandId = null; crew.status = "available"; }
    const byAction = this.cooldowns.get(command.factionId) || new Map(); byAction.set(command.actionIndex, command.cooldownUntilQuantum); this.cooldowns.set(command.factionId, byAction); if (this.activeByFaction.get(command.factionId) === command.commandId) this.activeByFaction.delete(command.factionId);
  }
  advanceToQuantum(targetQuantum) {
    if (!this.installed) throw new Error("ForestDefensiveCommandIntegrationV2 is not installed."); targetQuantum = Math.trunc(targetQuantum); if (targetQuantum < this.currentQuantum) throw new Error("Live command quantum cannot move backward.");
    while (this.currentQuantum < targetQuantum) { this.currentQuantum += 1; const ids = [...this.activeByFaction.values()]; for (const commandId of ids) { const command = this.commands.get(commandId); if (!command || command.status !== "active") continue; const next = this.processActiveCommand(command, this.currentQuantum); this.commands.set(commandId, next); this.ledger.append(next); if (terminal(next.status)) this.finalizeCommand(next); } }
    return this.captureRuntimeSnapshot();
  }
  getCommand(commandId) { const value = this.commands.get(commandId); return value ? clone(value) : null; }
  captureRuntimeSnapshot() {
    const factions = [...new Set([this.identityIntegration.humanFactionId, ...this.readiness.keys(), ...[...this.patrols.values()].map((p) => p.factionId), ...[...this.repairCrews.values()].map((p) => p.factionId)])].sort();
    return I().canonicalize({ commandSequence: this.commandSequence, commands: [...this.commands.values()].sort((a,b)=>a.commandSequence-b.commandSequence).map(clone), currentQuantum: this.currentQuantum, ledger: this.ledger.snapshot(), mode: forestDefensiveCommandContractV2().MODE, patrols: [...this.patrols.values()].sort((a,b)=>a.patrolId.localeCompare(b.patrolId)).map((p)=>this.publicAssignment(p,"patrol")), repairCrews: [...this.repairCrews.values()].sort((a,b)=>a.repairCrewId.localeCompare(b.repairCrewId)).map((p)=>this.publicAssignment(p,"repair")), requiredAuthority: forestDefensiveCommandContractV2().REQUIRED_AUTHORITY, runtimeCapacities: factions.map((factionId)=>I().canonicalize({ factionId, materials: this.materialsFor(factionId), readiness: this.readinessFor(factionId), totalPatrolSlots: this.patrolsFor(factionId).length, availablePatrolSlots: this.availablePatrolsFor(factionId).length, totalRepairCrewSlots: this.crewsFor(factionId).length, availableRepairCrewSlots: this.availableCrewsFor(factionId).length })), schemaVersion: 2 });
  }
  dispose() {
    this.installed = false; if (globalThis.ZekNovaForestDefensiveCommandIntegrationV2 === this) globalThis.ZekNovaForestDefensiveCommandIntegrationV2 = null; if (globalThis.ZekNovaIncumbentForestCommandControllerV2 === this.controller) globalThis.ZekNovaIncumbentForestCommandControllerV2 = null; if (globalThis.ZekNovaIncumbentForestCommandController === this.controller) globalThis.ZekNovaIncumbentForestCommandController = this.previousController; this.controller = null;
  }
}
