export { EngineKernel, createEngine, SYSTEM_PHASES } from "./EngineKernel.js";
export { EngineEvents, DisposableGroup } from "./EngineEvents.js";
export { EngineClock, ManualTimeSource, defaultTimeSource } from "./EngineClock.js";
export { LifecycleManager, LifecycleError, LIFECYCLE_STATES } from "./LifecycleManager.js";
export { PluginManager, PluginError } from "./PluginManager.js";
export { EngineMetrics } from "./EngineMetrics.js";
export { World } from "./World.js";
export const ZGE_CORE_VERSION = "0.1.0";

export { Authority, AUTHORITY } from "./Authority.js";
export { CommandQueue } from "./CommandQueue.js";
export { WORLD_STATE_SCHEMA, plainData, immutableData, createWorldState, validateWorldState, serializeWorldState, restoreWorldState } from './WorldState.js';
export { AuthorityDomain } from './AuthorityDomain.js';
export { GameplayEventJournal, GAMEPLAY_EVENT_SCHEMA, canonicalJSON } from './GameplayEventJournal.js';
