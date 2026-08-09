import { FactionKnowledgeLedger } from "../world/FactionKnowledgeLedger.js";
import "../../azl/zeknova-knowledge-ledger-adapter-v1.js";

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

export class FactionKnowledgeIntegration {
  constructor({ game, identityIntegration, perceptionIntegration, storage, storagePrefix = "zeknova.faction-knowledge.v1", quantumProvider } = {}) {
    if (!game) throw new Error("FactionKnowledgeIntegration requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("FactionKnowledgeIntegration requires W0-O.0 IdentityIntegration.");
    if (!perceptionIntegration?.stream) throw new Error("FactionKnowledgeIntegration requires W0-O.1 PerceptionEventIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.perceptionIntegration = perceptionIntegration;
    this.storage = safeStorage(storage);
    this.storagePrefix = storagePrefix;
    this.storageKey = `${storagePrefix}.${encodeURIComponent(identityIntegration.worldId)}`;
    this.quantumProvider = typeof quantumProvider === "function" ? quantumProvider : () => {
      const candidate = this.game.perceptionQuantum ?? this.game.controlQuantum ?? this.game.worldQuantum ?? this.game.tick ?? 0;
      const value = Number(candidate);
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    };
    this.ledger = this.restoreLedger();
    this.installed = false;
    this.boundEventListener = () => {
      try { this.sync(); } catch (error) { console.warn("ZekNova knowledge ledger could not ingest a perception event.", error); }
    };
  }

  identitySnapshot() {
    return this.identityIntegration.captureSnapshot();
  }

  perceptionSnapshot() {
    return this.perceptionIntegration.captureSnapshot();
  }

  restoreLedger() {
    const identitySnapshot = this.identitySnapshot();
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) return FactionKnowledgeLedger.fromSnapshot(identitySnapshot, JSON.parse(raw));
    } catch (error) {
      console.warn("Ignoring an invalid ZekNova faction knowledge snapshot.", error);
    }
    return new FactionKnowledgeLedger({ identitySnapshot, currentQuantum: 0 });
  }

  refreshIdentityView() {
    this.ledger = FactionKnowledgeLedger.fromSnapshot(this.identitySnapshot(), this.ledger.snapshot());
    return this.ledger;
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    this.sync();
    globalThis.ZekNovaFactionKnowledgeIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaFactionKnowledge = "w0o2-v1";
    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("zeknova:perception-event", this.boundEventListener);
    }
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:faction-knowledge-ready", {
        detail: {
          worldId: this.identityIntegration.worldId,
          ledgerHash: this.ledger.snapshotHash(),
          recordCount: this.ledger.snapshot().records.length,
        },
      }));
    }
    return this;
  }

  sync() {
    this.refreshIdentityView();
    this.ledger.synchronize(this.perceptionSnapshot());
    const candidate = Number(this.quantumProvider());
    if (Number.isSafeInteger(candidate) && candidate >= this.ledger.currentQuantum) {
      this.ledger.advanceToQuantum(candidate);
    }
    this.persist();
    return this.ledger.snapshot();
  }

  advanceToQuantum(quantum) {
    this.sync();
    this.ledger.advanceToQuantum(quantum);
    this.persist();
    return this.ledger.currentQuantum;
  }

  recordsForFaction(factionId, options) {
    this.sync();
    return this.ledger.recordsForFaction(factionId, options);
  }

  getRecord(factionId, subjectId, topic, options) {
    this.sync();
    return this.ledger.getRecord(factionId, subjectId, topic, options);
  }

  captureSnapshot() {
    this.sync();
    return this.ledger.snapshot();
  }

  persist() {
    try { this.storage.setItem(this.storageKey, JSON.stringify(this.ledger.snapshot())); }
    catch (error) { console.warn("ZekNova faction knowledge snapshot could not be persisted.", error); }
  }

  dispose() {
    if (!this.installed) return;
    this.persist();
    if (typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("zeknova:perception-event", this.boundEventListener);
    }
    this.installed = false;
    if (globalThis.ZekNovaFactionKnowledgeIntegration === this) globalThis.ZekNovaFactionKnowledgeIntegration = null;
  }
}
