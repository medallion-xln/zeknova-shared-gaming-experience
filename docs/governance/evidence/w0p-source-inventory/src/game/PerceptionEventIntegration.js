import { PerceptionEventStream } from "../world/PerceptionEvent.js";
import "../../azl/zeknova-perception-event-adapter-v1.js";

const CELL_SIZE = 1;

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function safeStorage(candidate) {
  if (candidate?.getItem && candidate?.setItem) return candidate;
  try { if (globalThis.localStorage) return globalThis.localStorage; } catch {}
  return memoryStorage();
}

function cell(position) {
  const q = (value) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) throw new Error("Perception position must be finite.");
    const quantized = Math.round(number / CELL_SIZE);
    return Object.is(quantized, -0) ? 0 : quantized;
  };
  return { x: q(position?.x), y: q(position?.y), z: q(position?.z) };
}

function entityIdFor(object, label) {
  const id = object?.userData?.entityId;
  if (!id) throw new Error(`${label} has no W0-O.0 entity identity.`);
  return id;
}

function factionIdFor(object, label) {
  const id = object?.userData?.ownerFactionId;
  if (!id) throw new Error(`${label} has no W0-O.0 owner faction identity.`);
  return id;
}

function distanceSquared(a, b) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0);
  const dy = Number(a?.y || 0) - Number(b?.y || 0);
  const dz = Number(a?.z || 0) - Number(b?.z || 0);
  return dx * dx + dy * dy + dz * dz;
}

export class PerceptionEventIntegration {
  constructor({ game, identityIntegration, storage, storagePrefix = "zeknova.perception-events.v1", quantumProvider } = {}) {
    if (!game) throw new Error("PerceptionEventIntegration requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("PerceptionEventIntegration requires W0-O.0 IdentityIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.storage = safeStorage(storage);
    this.storagePrefix = storagePrefix;
    this.storageKey = `${storagePrefix}.${encodeURIComponent(identityIntegration.worldId)}`;
    this.quantumProvider = typeof quantumProvider === "function" ? quantumProvider : () => {
      const candidate = this.game.perceptionQuantum ?? this.game.controlQuantum ?? this.game.worldQuantum ?? this.game.tick ?? 0;
      const value = Number(candidate);
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    };
    this.stream = this.restoreStream();
    this.installed = false;
  }

  identitySnapshot() {
    return this.identityIntegration.captureSnapshot();
  }

  restoreStream() {
    const identitySnapshot = this.identityIntegration.captureSnapshot();
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) return PerceptionEventStream.fromSnapshot(identitySnapshot, JSON.parse(raw));
    } catch (error) {
      console.warn("Ignoring an invalid ZekNova perception event snapshot.", error);
    }
    return new PerceptionEventStream({ identitySnapshot });
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    globalThis.ZekNovaPerceptionEventIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaPerceptionEvents = "w0o1-v1";
    this.persist();
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:perception-events-ready", {
        detail: {
          worldId: this.identityIntegration.worldId,
          streamHash: this.stream.snapshotHash(),
          eventCount: this.stream.snapshot().events.length,
        },
      }));
    }
    return this;
  }

  quantum(explicit) {
    const value = explicit == null ? this.quantumProvider() : Number(explicit);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("observedAtQuantum must be a nonnegative safe integer.");
    return value;
  }

  refreshIdentityView() {
    this.stream = PerceptionEventStream.fromSnapshot(this.identitySnapshot(), this.stream.snapshot());
    return this.stream;
  }

  append(input) {
    this.refreshIdentityView();
    const event = this.stream.append(input);
    this.persist();
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:perception-event", { detail: event }));
    }
    return event;
  }

  reportEnemySighted({ observer, enemy, observedAtQuantum, sourceType = "line_of_sight", hostility = "unknown", classification, movementBand = "unknown" } = {}) {
    return this.append({
      eventType: "enemy_sighted",
      observerFactionId: factionIdFor(observer, "observer"),
      sourceFactionId: factionIdFor(observer, "observer"),
      sourceEntityId: entityIdFor(observer, "observer"),
      subjectId: entityIdFor(enemy, "enemy"),
      observedAtQuantum: this.quantum(observedAtQuantum),
      sourceType,
      payload: {
        classification: classification || String(enemy?.userData?.enemyType || enemy?.userData?.role || "unknown_unit").toLowerCase(),
        hostility,
        movementBand,
        positionCell: cell(enemy?.position),
      },
    });
  }

  observeEnemyByProximity({ observer, enemy, radius, observedAtQuantum, hostility = "unknown", classification, movementBand = "unknown" } = {}) {
    const limit = Number(radius);
    if (!Number.isFinite(limit) || limit <= 0) throw new Error("radius must be a positive finite number.");
    if (distanceSquared(observer?.position, enemy?.position) > limit * limit) return null;
    return this.reportEnemySighted({ observer, enemy, observedAtQuantum, sourceType: "proximity_sensor", hostility, classification, movementBand });
  }

  reportEnemyLost({ observer, enemy, observedAtQuantum, sourceType = "line_of_sight", reason = "out_of_range", lastKnownPosition } = {}) {
    return this.append({
      eventType: "enemy_lost",
      observerFactionId: factionIdFor(observer, "observer"),
      sourceFactionId: factionIdFor(observer, "observer"),
      sourceEntityId: entityIdFor(observer, "observer"),
      subjectId: entityIdFor(enemy, "enemy"),
      observedAtQuantum: this.quantum(observedAtQuantum),
      sourceType,
      payload: { lastKnownPositionCell: cell(lastKnownPosition || enemy?.position), reason },
    });
  }

  reportCombatAlert({ observer, subject, observedAtQuantum, sourceType = "combat_contact", severity = "medium", contactRole = "unknown", position } = {}) {
    return this.append({
      eventType: "combat_alert",
      observerFactionId: factionIdFor(observer, "observer"),
      sourceFactionId: factionIdFor(observer, "observer"),
      sourceEntityId: entityIdFor(observer, "observer"),
      subjectId: entityIdFor(subject, "subject"),
      observedAtQuantum: this.quantum(observedAtQuantum),
      sourceType,
      payload: { contactRole, positionCell: cell(position || subject?.position), severity },
    });
  }

  reportStructureObserved({ observer, structureEntityId, position, structureKind, observedOwnerFactionId = null, statusBand = "unknown", observedAtQuantum, sourceType = "line_of_sight" } = {}) {
    return this.append({
      eventType: "structure_observed",
      observerFactionId: factionIdFor(observer, "observer"),
      sourceFactionId: factionIdFor(observer, "observer"),
      sourceEntityId: entityIdFor(observer, "observer"),
      subjectId: structureEntityId,
      observedAtQuantum: this.quantum(observedAtQuantum),
      sourceType,
      payload: { observedOwnerFactionId, positionCell: cell(position), statusBand, structureKind },
    });
  }

  reportResourceDiscovered({ observer, resource, resourceKind, abundanceBand = "unknown", observedAtQuantum, sourceType = "proximity_sensor" } = {}) {
    return this.append({
      eventType: "resource_discovered",
      observerFactionId: factionIdFor(observer, "observer"),
      sourceFactionId: factionIdFor(observer, "observer"),
      sourceEntityId: entityIdFor(observer, "observer"),
      subjectId: entityIdFor(resource, "resource"),
      observedAtQuantum: this.quantum(observedAtQuantum),
      sourceType,
      payload: { abundanceBand, positionCell: cell(resource?.position), resourceKind },
    });
  }

  shareEvent({ originalEventId, sender, recipientFactionId, observedAtQuantum, shareMode = "direct" } = {}) {
    this.refreshIdentityView();
    const event = this.stream.share({
      originalEventId,
      senderFactionId: factionIdFor(sender, "sender"),
      recipientFactionId,
      sourceEntityId: entityIdFor(sender, "sender"),
      observedAtQuantum: this.quantum(observedAtQuantum),
      shareMode,
    });
    this.persist();
    return event;
  }

  captureSnapshot() {
    return this.stream.snapshot();
  }

  persist() {
    try { this.storage.setItem(this.storageKey, JSON.stringify(this.stream.snapshot())); }
    catch (error) { console.warn("ZekNova perception event snapshot could not be persisted.", error); }
  }

  dispose() {
    if (!this.installed) return;
    this.persist();
    this.installed = false;
    if (globalThis.ZekNovaPerceptionEventIntegration === this) globalThis.ZekNovaPerceptionEventIntegration = null;
  }
}
