import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";

const Contract = globalThis.ZekNovaKnowledgeLedgerContract;
if (!Contract) throw new Error("ZekNova faction knowledge ledger contract failed to load.");

export const KNOWLEDGE_LEDGER_SCHEMA_VERSION = Contract.SCHEMA_VERSION;
export const KNOWLEDGE_LEDGER_CONTRACT_ID = Contract.CONTRACT_ID;
export const KNOWLEDGE_LEDGER_REGISTRY_ID = Contract.REGISTRY_ID;
export const KNOWLEDGE_TOPICS = Contract.TOPICS;
export const KNOWLEDGE_EVENT_POLICIES = Contract.EVENT_POLICIES;
export const FactionKnowledgeLedger = Contract.FactionKnowledgeLedger;
export const createKnowledgeRecordId = Contract.recordIdFor;
export const isKnowledgeRecordId = Contract.isRecordId;
