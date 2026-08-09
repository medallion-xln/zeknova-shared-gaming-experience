import { forestDefensiveCommandContract } from "../world/ForestDefensiveCommands.js";
import "../../azl/zeknova-forest-defensive-command-adapter-v1.js";

const I = () => globalThis.ZekNovaIdentityContract;
const F = () => globalThis.ZekNovaForestDefensiveActionContract;
const DEFAULT_RESOURCES = Object.freeze({ materials: 40, repairCrewSlots: 1 });
const INTERCEPT_RANGE = 2;
const AUTHORITY_CAPABILITIES = new WeakMap();

const clone = (value) => I().stableClone(value);
const cell = (position) => ({ x: Math.round(Number(position?.x || 0)), y: Math.round(Number(position?.y || 0)), z: Math.round(Number(position?.z || 0)) });
const distanceXZ = (a, b) => Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.z || 0) - Number(b?.z || 0));

function positionRef(object) {
  if (!object) return null;
  if (object.position && typeof object.position === "object") return object.position;
  if (typeof object.x === "number" && typeof object.z === "number") return object;
  return null;
}

function setPosition(object, target) {
  const ref = positionRef(object);
  if (!ref) throw new Error("Patrol object has no mutable position.");
  if (typeof ref.set === "function") ref.set(target.x, target.y, target.z);
  else { ref.x = target.x; ref.y = target.y; ref.z = target.z; }
}

export class ForestDefensiveCommandIntegration {
  constructor({ game, identityIntegration, forestActionIntegration, quantumProvider = null, initialReadiness = 60 } = {}) {
    if (!game) throw new Error("ForestDefensiveCommandIntegration requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("ForestDefensiveCommandIntegration requires W0-O.0 IdentityIntegration.");
    if (!forestActionIntegration?.captureForFaction) throw new Error("ForestDefensiveCommandIntegration requires W0-AF ForestDefensiveActionIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.forestActionIntegration = forestActionIntegration;
    this.quantumProvider = quantumProvider || (() => Number(game.perceptionQuantum || 0));
    this.initialReadiness = Math.max(0, Math.trunc(initialReadiness));
    this.currentQuantum = Math.max(0, Math.trunc(this.quantumProvider()));
    this.commandSequence = 0;
    this.commands = new Map();
    this.runtime = new Map();
    this.patrols = new Map();
    this.readiness = new Map();
    this.cooldowns = new Map();
    this.activeByFaction = new Map();
    this.ledger = new (forestDefensiveCommandContract().CommandEventLedger)();
    this.installed = false;
    this.controller = null;
    AUTHORITY_CAPABILITIES.set(this, Object.freeze({ runtime: "w0p1-incumbent-capability" }));
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    for (const item of this.game.forestPatrols || []) this.registerPatrol(item);
    const runtime = this;
    this.controller = Object.freeze({
      id: "zeknova-incumbent-forest-command-controller-v1",
      authoritySource: forestDefensiveCommandContract().REQUIRED_AUTHORITY,
      issue: (options) => runtime.issueCommand({ ...(options || {}), authoritySource: forestDefensiveCommandContract().REQUIRED_AUTHORITY, authorityCapability: AUTHORITY_CAPABILITIES.get(runtime) }),
      advanceToQuantum: (quantum) => runtime.advanceToQuantum(quantum),
      registerPatrol: (options) => runtime.registerPatrol(options),
      getCommand: (commandId) => runtime.getCommand(commandId),
      captureRuntimeSnapshot: () => runtime.captureRuntimeSnapshot(),
    });
    globalThis.ZekNovaForestDefensiveCommandIntegration = this;
    globalThis.ZekNovaIncumbentForestCommandController = this.controller;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaForestCommands = "w0p1-v1";
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      const C = forestDefensiveCommandContract();
      globalThis.dispatchEvent(new CustomEvent("zeknova:forest-command-runtime-ready", { detail: { commandSpaceId: C.COMMAND_SPACE_ID, mode: C.MODE, requiredAuthority: C.REQUIRED_AUTHORITY, supportedActionIndexes: C.SUPPORTED_ACTION_INDEXES } }));
    }
    return this;
  }

  readinessFor(factionId) {
    if (!this.readiness.has(factionId)) this.readiness.set(factionId, this.initialReadiness);
    return this.readiness.get(factionId);
  }

  createPatrolId(factionId, ordinal) {
    return `zkpatrol:v1:${I().hash64x2({ factionId, ordinal: Number(ordinal || 0), worldId: this.identityIntegration.worldId })}`;
  }

  registerPatrol(raw = {}) {
    const factionId = raw.factionId || this.identityIntegration.humanFactionId;
    I().assertCanonicalIdentity(factionId, "factionId");
    const object = raw.object || raw.group || raw;
    const ref = positionRef(object);
    if (!ref) throw new Error("Forest patrol registration requires a live position object.");
    const ordinal = [...this.patrols.values()].filter((p) => p.factionId === factionId).length;
    const patrolId = String(raw.patrolId || object.userData?.patrolId || this.createPatrolId(factionId, ordinal));
    if (!/^zkpatrol:v1:[0-9a-f]{16}$/.test(patrolId)) throw new Error("Invalid patrolId.");
    const home = cell(raw.homePosition || raw.home || ref);
    if (!object.userData || typeof object.userData !== "object") object.userData = {};
    object.userData.patrolId = patrolId;
    object.userData.factionId = factionId;
    const patrol = { patrolId, factionId, object, homePosition: home, reservedByCommandId: null, status: "available" };
    this.patrols.set(patrolId, patrol);
    return this.publicPatrol(patrol);
  }

  publicPatrol(patrol) {
    return I().canonicalize({
      factionId: patrol.factionId,
      homePosition: patrol.homePosition,
      patrolId: patrol.patrolId,
      position: cell(positionRef(patrol.object)),
      reservedByCommandId: patrol.reservedByCommandId,
      status: patrol.status,
    });
  }

  patrolsFor(factionId) { return [...this.patrols.values()].filter((p) => p.factionId === factionId); }
  availablePatrolsFor(factionId) { return this.patrolsFor(factionId).filter((p) => p.reservedByCommandId == null); }

  lifecycleFor(factionId, quantum) {
    const cooldown = new Array(F().ACTION_COUNT).fill(0);
    const byAction = this.cooldowns.get(factionId) || new Map();
    for (const [index, until] of byAction) cooldown[index] = Math.max(0, Number(until) - quantum);
    const execution = new Array(F().ACTION_COUNT).fill(0);
    const activeId = this.activeByFaction.get(factionId) || null;
    const active = activeId ? this.commands.get(activeId) : null;
    let activeActionIndex = -1, commitment = 0;
    if (active?.status === "active") {
      activeActionIndex = active.actionIndex;
      execution[active.actionIndex] = active.executionQuantaRemaining;
      commitment = Math.min(F().ACTIONS[active.actionIndex].cost.commitmentQuanta, active.executionQuantaRemaining);
    }
    return { activeActionIndex, commitmentQuantaRemaining: commitment, cooldownQuantaRemaining: cooldown, executionQuantaRemaining: execution };
  }

  captureCommandContext(factionId, options = {}) {
    const quantum = options.quantum == null ? this.currentQuantum : Math.trunc(options.quantum);
    const capacities = {
      materials: options.materials == null ? DEFAULT_RESOURCES.materials : Math.max(0, Math.trunc(options.materials)),
      patrolSlots: this.patrolsFor(factionId).length,
      readiness: this.readinessFor(factionId),
      repairCrewSlots: options.repairCrewSlots == null ? DEFAULT_RESOURCES.repairCrewSlots : Math.max(0, Math.trunc(options.repairCrewSlots)),
    };
    return this.forestActionIntegration.captureForFaction(factionId, {
      quantum,
      capacities,
      capacitySource: "w0p1-live-command-runtime-v1",
      lifecycle: this.lifecycleFor(factionId, quantum),
      terminal: options.terminal ?? false,
      replanBoundary: options.replanBoundary ?? false,
    });
  }

  targetDetails(bundle, actionIndex, targetId) {
    const entry = bundle.candidateSet.entries[actionIndex];
    const target = entry?.targets?.find((item) => item.targetId === targetId);
    if (!target) throw new Error("Target is not canonical for the live candidate set.");
    const section = bundle.observation.sections.find((item) => item.topic === target.topic);
    const slot = section?.slots?.[target.slotIndex];
    if (!slot || slot.recordId !== target.recordId || slot.subjectId !== target.subjectId) throw new Error("Target slot does not match the canonical observation.");
    const facts = slot.facts || {};
    const position = facts.positionCell || facts.observedCell || facts.lastKnownPositionCell || null;
    if (!position) throw new Error("Command target has no grounded observed position.");
    return { target: clone(target), slot: clone(slot), targetPosition: cell(position) };
  }

  resolvePatrol(factionId, actionIndex, requestedPatrolId) {
    if (actionIndex === 12) {
      const activeId = this.activeByFaction.get(factionId);
      const active = activeId ? this.commands.get(activeId) : null;
      if (!active || active.status !== "active") throw new Error("withdraw_exposed_patrol requires an active incumbent patrol command.");
      const patrol = this.patrols.get(requestedPatrolId || active.patrolId);
      if (!patrol || patrol.factionId !== factionId || patrol.reservedByCommandId !== active.commandId) throw new Error("Active patrol assignment is unavailable for withdrawal.");
      return patrol;
    }
    const patrol = requestedPatrolId ? this.patrols.get(requestedPatrolId) : this.availablePatrolsFor(factionId)[0];
    if (!patrol || patrol.factionId !== factionId || patrol.reservedByCommandId != null) throw new Error("No live patrol slot is available.");
    return patrol;
  }

  issueCommand(options = {}) {
    if (!this.installed) throw new Error("ForestDefensiveCommandIntegration is not installed.");
    const C = forestDefensiveCommandContract();
    if (options.authoritySource !== C.REQUIRED_AUTHORITY) throw new Error("Live command authority must be incumbent-scripted-ai.");
    if (options.authorityCapability !== AUTHORITY_CAPABILITIES.get(this)) throw new Error("Live command requires the incumbent runtime capability.");
    const factionId = options.factionId || this.identityIntegration.humanFactionId;
    const quantum = options.quantum == null ? Math.max(this.currentQuantum, Math.trunc(this.quantumProvider())) : Math.trunc(options.quantum);
    if (quantum < this.currentQuantum) throw new Error("Live command quantum cannot move backward.");
    if (quantum > this.currentQuantum) this.advanceToQuantum(quantum);
    const actionIndex = Math.trunc(options.actionIndex);
    if (!C.SUPPORTED_ACTION_INDEXES.includes(actionIndex)) throw new Error("Action is outside W0-P.1 vertical slice.");
    const bundle = this.captureCommandContext(factionId, { quantum, terminal: options.terminal, replanBoundary: options.replanBoundary });
    const details = this.targetDetails(bundle, actionIndex, options.targetId);
    const patrol = this.resolvePatrol(factionId, actionIndex, options.patrolId);
    const request = C.createCommandRequest({
      worldId: bundle.observation.worldId,
      factionId,
      observationId: bundle.observation.observationId,
      planningStateId: bundle.state.stateId,
      candidateSetId: bundle.candidateSet.candidateSetId,
      actionIndex,
      targetId: options.targetId,
      patrolId: patrol.patrolId,
      issuedAtQuantum: quantum,
      authoritySource: options.authoritySource,
      commandSequence: ++this.commandSequence,
    });

    const interruptedId = actionIndex === 12 ? this.activeByFaction.get(factionId) : null;
    const slotsBefore = this.availablePatrolsFor(factionId).length;
    let accepted = C.createAcceptedCommand({
      request,
      observation: bundle.observation,
      planningState: bundle.state,
      candidateSet: bundle.candidateSet,
      acceptedAtQuantum: quantum,
      readinessBeforeAcceptance: this.readinessFor(factionId),
      availablePatrolSlotsBeforeAcceptance: slotsBefore,
    });

    if (interruptedId) {
      const previous = this.commands.get(interruptedId);
      const interrupted = C.advanceCommand(previous, { quantum, interruptedByCommandId: request.commandId, observedEffects: ["patrol_assignment_transferred_to_withdrawal"] });
      this.commands.set(interrupted.commandId, interrupted);
      this.ledger.append(interrupted);
      const byAction = this.cooldowns.get(factionId) || new Map();
      byAction.set(interrupted.actionIndex, interrupted.cooldownUntilQuantum);
      this.cooldowns.set(factionId, byAction);
    }

    this.readiness.set(factionId, accepted.readinessAfterAcceptance);
    if (actionIndex !== 12) patrol.reservedByCommandId = request.commandId;
    else patrol.reservedByCommandId = request.commandId;
    patrol.status = actionIndex === 12 ? "withdrawing" : (actionIndex === 3 ? "intercepting" : "patrolling");
    accepted = C.startCommand(accepted, quantum);
    this.commands.set(accepted.commandId, accepted);
    this.runtime.set(accepted.commandId, { target: details.target, slot: details.slot, targetPosition: details.targetPosition, outboundReached: false });
    this.activeByFaction.set(factionId, accepted.commandId);
    this.ledger.append(accepted);
    return clone({ bundle, command: accepted, patrol: this.publicPatrol(patrol) });
  }

  liveTargetObject(subjectId) {
    const tracked = this.identityIntegration.trackedEnemies?.get(subjectId);
    if (tracked) return tracked;
    return (this.game.enemies || []).find((item) => item?.userData?.entityId === subjectId) || null;
  }

  processActiveCommand(command, quantum) {
    const C = forestDefensiveCommandContract();
    const patrol = this.patrols.get(command.patrolId);
    const run = this.runtime.get(command.commandId);
    if (!patrol || !run) return C.advanceCommand(command, { quantum, failureReason: "runtime_assignment_missing", observedEffects: [] });
    if (command.actionIndex === 1) {
      if (!run.outboundReached) {
        setPosition(patrol.object, run.targetPosition);
        run.outboundReached = true;
        const next = C.advanceCommand(command, { quantum, observedEffects: ["patrol_reached_route_endpoint"] });
        if (next.status === "failed" && next.failureReason === "completion_signal_missing") return C.advanceCommand(command, { quantum, completionSignal: "route_patrol_circuit_completed", observedEffects: ["patrol_reached_route_endpoint","patrol_returned_to_defensive_origin"] });
        return next;
      }
      setPosition(patrol.object, patrol.homePosition);
      return C.advanceCommand(command, { quantum, completionSignal: "route_patrol_circuit_completed", observedEffects: ["patrol_reached_route_endpoint","patrol_returned_to_defensive_origin"] });
    }
    if (command.actionIndex === 3) {
      const target = this.liveTargetObject(run.target.subjectId);
      if (!target || Number(target.userData?.health || 0) <= 0) return C.advanceCommand(command, { quantum, completionSignal: "hostile_contact_retired", observedEffects: ["hostile_contact_no_longer_active"] });
      const targetPosition = cell(positionRef(target));
      setPosition(patrol.object, targetPosition);
      if (distanceXZ(positionRef(patrol.object), positionRef(target)) <= INTERCEPT_RANGE) return C.advanceCommand(command, { quantum, completionSignal: "patrol_entered_intercept_range", observedEffects: ["patrol_entered_intercept_range"] });
      return C.advanceCommand(command, { quantum, failureReason: "intercept_range_not_reached", observedEffects: ["patrol_advanced_toward_contact"] });
    }
    if (command.actionIndex === 12) {
      setPosition(patrol.object, patrol.homePosition);
      return C.advanceCommand(command, { quantum, completionSignal: "patrol_entered_defensive_return_zone", observedEffects: ["patrol_returned_to_defensive_origin"] });
    }
    return C.advanceCommand(command, { quantum, failureReason: "unsupported_runtime_action", observedEffects: [] });
  }

  finalizeCommand(command) {
    const patrol = this.patrols.get(command.patrolId);
    if (patrol) { patrol.reservedByCommandId = null; patrol.status = "available"; }
    const byAction = this.cooldowns.get(command.factionId) || new Map();
    byAction.set(command.actionIndex, command.cooldownUntilQuantum);
    this.cooldowns.set(command.factionId, byAction);
    if (this.activeByFaction.get(command.factionId) === command.commandId) this.activeByFaction.delete(command.factionId);
  }

  advanceToQuantum(targetQuantum) {
    if (!this.installed) throw new Error("ForestDefensiveCommandIntegration is not installed.");
    targetQuantum = Math.trunc(targetQuantum);
    if (targetQuantum < this.currentQuantum) throw new Error("Live command quantum cannot move backward.");
    while (this.currentQuantum < targetQuantum) {
      this.currentQuantum += 1;
      const activeIds = [...this.activeByFaction.values()];
      for (const commandId of activeIds) {
        const command = this.commands.get(commandId);
        if (!command || command.status !== "active") continue;
        const next = this.processActiveCommand(command, this.currentQuantum);
        this.commands.set(commandId, next);
        this.ledger.append(next);
        if (["completed","failed","interrupted"].includes(next.status)) this.finalizeCommand(next);
      }
    }
    return this.captureRuntimeSnapshot();
  }

  getCommand(commandId) { const value = this.commands.get(commandId); return value ? clone(value) : null; }

  captureRuntimeSnapshot() {
    const capacities = [...new Set([...this.readiness.keys(), ...this.patrols.values()].map((item) => typeof item === "string" ? item : item.factionId))].sort().map((factionId) => I().canonicalize({ factionId, readiness: this.readinessFor(factionId), totalPatrolSlots: this.patrolsFor(factionId).length, availablePatrolSlots: this.availablePatrolsFor(factionId).length }));
    return I().canonicalize({
      commandSequence: this.commandSequence,
      commands: [...this.commands.values()].sort((a,b) => a.commandSequence-b.commandSequence).map(clone),
      currentQuantum: this.currentQuantum,
      ledger: this.ledger.snapshot(),
      mode: forestDefensiveCommandContract().MODE,
      patrols: [...this.patrols.values()].sort((a,b) => a.patrolId.localeCompare(b.patrolId)).map((p) => this.publicPatrol(p)),
      requiredAuthority: forestDefensiveCommandContract().REQUIRED_AUTHORITY,
      runtimeCapacities: capacities,
      schemaVersion: 1,
    });
  }

  dispose() {
    this.installed = false;
    if (globalThis.ZekNovaForestDefensiveCommandIntegration === this) globalThis.ZekNovaForestDefensiveCommandIntegration = null;
    if (globalThis.ZekNovaIncumbentForestCommandController === this.controller) globalThis.ZekNovaIncumbentForestCommandController = null;
    this.controller = null;
  }
}
