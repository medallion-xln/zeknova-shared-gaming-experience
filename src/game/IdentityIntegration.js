import {
  createWorldId,
  createHumanFactionId,
  createSettlementFactionId,
} from "../world/FactionIdentity.js";
import {
  IdentityRegistry,
  createSettlementEntityId,
  createHumanUnitEntityId,
  createStructureEntityId,
  createResourceEntityId,
  createAreaEntityId,
  createRouteEntityId,
} from "../world/EntityIdentity.js";
import "../../azl/zeknova-identity-adapter-v1.js";

const POSITION_QUANTUM = 0.01;
const SYNC_INTERVAL_MS = 500;

const quantize = (value, quantum = POSITION_QUANTUM) => {
  const number = Number(value || 0);
  return Math.round(number / quantum) * quantum;
};

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
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {}
  return memoryStorage();
}

function pointMetadata(position) {
  return {
    x: quantize(position?.x),
    y: quantize(position?.y),
    z: quantize(position?.z),
  };
}

function ensureUserData(object) {
  if (!object) return null;
  if (!object.userData || typeof object.userData !== "object") object.userData = {};
  return object.userData;
}

export class IdentityIntegration {
  constructor({ game, storage, storagePrefix = "zeknova.identity.v1" } = {}) {
    if (!game) throw new Error("IdentityIntegration requires the live ZekNova game.");
    this.game = game;
    this.storage = safeStorage(storage);
    this.storagePrefix = storagePrefix;
    this.worldId = createWorldId({ teamCode: game.user?.teamCode, biomeSeed: game.biomeSeed });
    this.humanFactionId = createHumanFactionId({ teamCode: game.user?.teamCode });
    this.storageKey = `${storagePrefix}.${encodeURIComponent(this.worldId)}`;
    this.registry = this.restoreRegistry();
    this.settlements = [];
    this.trackedEnemies = new Map();
    this.originalSpawnEnemy = null;
    this.originalAddRecord = null;
    this.timer = 0;
    this.installed = false;
  }

  restoreRegistry() {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) {
        const registry = IdentityRegistry.fromSnapshot(JSON.parse(raw));
        if (registry.worldId === this.worldId) return registry;
      }
    } catch (error) {
      console.warn("Ignoring an invalid ZekNova identity snapshot.", error);
    }
    return new IdentityRegistry({ worldId: this.worldId });
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    this.retireUnboundTransientEntities();
    this.registerFactions();
    this.registerSettlements();
    this.registerLocalPlayer();
    this.registerAreasAndRoutes();
    this.synchronizeStructures();
    this.synchronizeResources();
    this.synchronizeEnemies();
    this.synchronizeRemotePlayers();
    this.wrapSpawnEnemy();
    this.wrapBuildingRegistration();
    this.timer = globalThis.setInterval?.(() => this.synchronize(), SYNC_INTERVAL_MS) || 0;
    globalThis.ZekNovaIdentityIntegration = this;
    if (globalThis.document?.documentElement) {
      document.documentElement.dataset.zeknovaIdentity = "w0o0-v1";
    }
    this.persist();
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:identity-ready", {
        detail: {
          worldId: this.worldId,
          humanFactionId: this.humanFactionId,
          snapshotHash: this.registry.snapshotHash(),
        },
      }));
    }
    return this;
  }

  retireUnboundTransientEntities() {
    for (const record of this.registry.snapshot().entities) {
      if (record.metadata?.runtimeKind === "enemy") this.registry.retire(record.entityId);
    }
  }

  registerFactions() {
    this.registry.registerFaction({
      factionId: this.humanFactionId,
      kind: "human_team",
      sourceKey: `team:${this.humanFactionId}`,
      metadata: {},
    });
  }

  registerSettlements() {
    const centers = Array.isArray(this.game.terrain?.localTerritories) ? this.game.terrain.localTerritories : [];
    this.settlements = centers.map((center, settlementOrdinal) => {
      const factionId = createSettlementFactionId({ worldId: this.worldId, settlementOrdinal });
      const entityId = createSettlementEntityId({ worldId: this.worldId, settlementOrdinal });
      this.registry.registerFaction({
        factionId,
        kind: "zeknovan_settlement",
        sourceKey: `settlement:${settlementOrdinal}`,
        metadata: { settlementOrdinal },
      });
      this.registry.registerEntity({
        entityId,
        kind: "settlement",
        ownerFactionId: factionId,
        sourceKey: `settlement:${settlementOrdinal}`,
        metadata: { settlementOrdinal },
      });
      return Object.freeze({ settlementOrdinal, factionId, entityId, center: pointMetadata(center) });
    });
  }

  nearestSettlementFaction(position) {
    if (!this.settlements.length) return null;
    let best = this.settlements[0];
    let bestDistance = Infinity;
    for (const settlement of this.settlements) {
      const dx = Number(position?.x || 0) - settlement.center.x;
      const dz = Number(position?.z || 0) - settlement.center.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        best = settlement;
        bestDistance = distance;
      }
    }
    return best?.factionId || null;
  }

  attachIdentity(object, record) {
    const userData = ensureUserData(object);
    if (!userData || !record) return record;
    userData.entityId = record.entityId;
    userData.ownerFactionId = record.ownerFactionId;
    userData.identitySchemaVersion = 1;
    return record;
  }

  registerLocalPlayer() {
    const player = this.game.player?.group;
    if (!player) return null;
    const entityId = createHumanUnitEntityId({
      worldId: this.worldId,
      userId: this.game.user?.id || this.game.user?.email,
      clientId: this.game.multiplayerRoom?.clientId || "local",
    });
    const existing = this.registry.getEntity(entityId);
    const record = existing || this.registry.registerEntity({
      entityId,
      kind: "unit",
      ownerFactionId: this.humanFactionId,
      sourceKey: `local-player:${this.game.user?.id || this.game.user?.email || "local"}`,
      metadata: {
        role: "player",
        officerClass: String(this.game.user?.officerClass || "ensign"),
      },
    });
    return this.attachIdentity(player, record);
  }

  registerRemotePlayer(clientId, group) {
    if (!clientId || !group) return null;
    const entityId = createHumanUnitEntityId({ worldId: this.worldId, clientId });
    const existing = this.registry.getEntity(entityId);
    const record = existing || this.registry.registerEntity({
      entityId,
      kind: "unit",
      ownerFactionId: this.humanFactionId,
      sourceKey: `remote-client:${clientId}`,
      metadata: {
        role: "remote_player",
        clientId: String(clientId),
        displayName: String(group.userData?.displayName || "Crew Member"),
      },
    });
    return this.attachIdentity(group, record);
  }

  registerEnemy(enemy) {
    if (!enemy) return null;
    const currentId = enemy.userData?.entityId;
    if (currentId) {
      const existing = this.registry.getEntity(currentId);
      if (existing) {
        this.trackedEnemies.set(currentId, enemy);
        return existing;
      }
    }
    const role = String(enemy.userData?.enemyType || enemy.userData?.enemyLabel || "unknown").toLowerCase();
    const ownerFactionId = this.nearestSettlementFaction(enemy.position) || this.settlements[0]?.factionId || null;
    if (!ownerFactionId) return null;
    const record = this.registry.allocateSpawn({
      role,
      ownerFactionId,
      metadata: {
        runtimeKind: "enemy",
        hostile: Boolean(enemy.userData?.hostile),
        guardian: Boolean(enemy.userData?.guardian),
        positionAtRegistration: pointMetadata(enemy.position),
      },
    });
    this.attachIdentity(enemy, record);
    this.trackedEnemies.set(record.entityId, enemy);
    return record;
  }

  registerStructure(record) {
    if (!record?.id) return null;
    const entityId = createStructureEntityId({ worldId: this.worldId, recordId: record.id });
    const existing = this.registry.getEntity(entityId);
    if (existing) return existing;
    return this.registry.registerEntity({
      entityId,
      kind: "structure",
      ownerFactionId: this.humanFactionId,
      sourceKey: `structure:${record.id}`,
      metadata: {
        structureType: String(record.type || "unknown"),
        position: pointMetadata(record),
      },
    });
  }

  registerResource(object, resourceKind, sourceId) {
    if (!object || sourceId == null) return null;
    const entityId = createResourceEntityId({ worldId: this.worldId, resourceKind, sourceId });
    const existing = this.registry.getEntity(entityId);
    const record = existing || this.registry.registerEntity({
      entityId,
      kind: "resource",
      ownerFactionId: null,
      sourceKey: `${resourceKind}:${sourceId}`,
      metadata: { resourceKind, position: pointMetadata(object.position) },
    });
    return this.attachIdentity(object, record);
  }

  registerAreasAndRoutes() {
    for (const areaKey of ["forest", "desert", "highlands", "arctic", "wetlands"]) {
      const entityId = createAreaEntityId({ worldId: this.worldId, areaKey });
      if (!this.registry.getEntity(entityId)) {
        this.registry.registerEntity({
          entityId,
          kind: "area",
          ownerFactionId: null,
          sourceKey: `area:${areaKey}`,
          metadata: { areaKey },
        });
      }
    }
    for (const routeKey of ["central-river-crossing"]) {
      const entityId = createRouteEntityId({ worldId: this.worldId, routeKey });
      if (!this.registry.getEntity(entityId)) {
        this.registry.registerEntity({
          entityId,
          kind: "route",
          ownerFactionId: null,
          sourceKey: `route:${routeKey}`,
          metadata: { routeKey },
        });
      }
    }
  }

  synchronizeStructures() {
    for (const record of this.game.buildings?.records || []) this.registerStructure(record);
  }

  synchronizeResources() {
    const terrain = this.game.terrain;
    for (const tree of terrain?.harvestableTrees || []) this.registerResource(tree, "tree", tree.userData?.treeId);
    for (const powerUp of terrain?.powerUpNodes || []) this.registerResource(powerUp, "powerup", powerUp.userData?.powerUpId);
    for (const rock of terrain?.mineableRocks || []) this.registerResource(rock, "rock", rock.userData?.rockId);
    for (const node of terrain?.resourceNodes || []) {
      const sourceId = node.userData?.resourceId || node.userData?.nodeId;
      if (sourceId != null) this.registerResource(node, "field-node", sourceId);
    }
  }

  synchronizeEnemies() {
    const current = new Set();
    for (const enemy of this.game.enemies || []) {
      const record = this.registerEnemy(enemy);
      if (record) current.add(record.entityId);
    }
    for (const [entityId, enemy] of this.trackedEnemies) {
      const alive = current.has(entityId) && Number(enemy?.userData?.health || 0) > 0;
      if (!alive) {
        this.registry.retire(entityId);
        this.trackedEnemies.delete(entityId);
      }
    }
  }

  synchronizeRemotePlayers() {
    const remotePlayers = this.game.multiplayerRoom?.remotePlayers;
    if (!(remotePlayers instanceof Map)) return;
    for (const [clientId, group] of remotePlayers) this.registerRemotePlayer(clientId, group);
  }

  synchronize() {
    if (this.game.disposed) {
      this.dispose();
      return;
    }
    this.registerLocalPlayer();
    this.synchronizeStructures();
    this.synchronizeResources();
    this.synchronizeEnemies();
    this.synchronizeRemotePlayers();
    this.persist();
  }

  wrapSpawnEnemy() {
    if (typeof this.game.spawnEnemy !== "function" || this.originalSpawnEnemy) return;
    this.originalSpawnEnemy = this.game.spawnEnemy;
    const integration = this;
    this.game.spawnEnemy = function (...args) {
      const before = new Set(this.enemies || []);
      const result = integration.originalSpawnEnemy.apply(this, args);
      if (result && typeof result === "object") integration.registerEnemy(result);
      for (const enemy of this.enemies || []) if (!before.has(enemy)) integration.registerEnemy(enemy);
      integration.persist();
      return result;
    };
  }

  wrapBuildingRegistration() {
    const buildings = this.game.buildings;
    if (!buildings || typeof buildings.addRecord !== "function" || this.originalAddRecord) return;
    this.originalAddRecord = buildings.addRecord;
    const integration = this;
    buildings.addRecord = function (record, ...rest) {
      const result = integration.originalAddRecord.call(this, record, ...rest);
      integration.registerStructure(record);
      integration.persist();
      return result;
    };
  }

  captureSnapshot() {
    this.synchronize();
    return this.registry.snapshot();
  }

  identityForObject(object) {
    const id = object?.userData?.entityId;
    return id ? this.registry.getEntity(id) : null;
  }

  settlementIdentity(settlementOrdinal) {
    return this.settlements.find((item) => item.settlementOrdinal === Number(settlementOrdinal)) || null;
  }

  persist() {
    try { this.storage.setItem(this.storageKey, JSON.stringify(this.registry.snapshot())); }
    catch (error) { console.warn("ZekNova identity snapshot could not be persisted.", error); }
  }

  dispose() {
    if (!this.installed) return;
    this.persist();
    if (this.timer) globalThis.clearInterval?.(this.timer);
    this.timer = 0;
    if (this.originalSpawnEnemy) this.game.spawnEnemy = this.originalSpawnEnemy;
    if (this.originalAddRecord && this.game.buildings) this.game.buildings.addRecord = this.originalAddRecord;
    this.originalSpawnEnemy = null;
    this.originalAddRecord = null;
    this.installed = false;
    if (globalThis.ZekNovaIdentityIntegration === this) globalThis.ZekNovaIdentityIntegration = null;
  }
}
