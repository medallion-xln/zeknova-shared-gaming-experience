// Type declarations for @zge/core (JavaScript ESM runtime; TypeScript migration path documented in docs/engine/ENGINE_KERNEL_API.md).
export type LifecycleState = "created" | "initialized" | "running" | "paused" | "stopped" | "disposed";
export type SystemPhase = "input" | "simulate" | "physics" | "post" | "render";
export type GuardState = "pending" | "ready" | "degraded" | "failed";
export type PluginStatus = "registered" | "installed" | "failed" | "skipped" | "started" | "stopped" | "disposed";

export interface EventMeta { type: string; time: number }
export type EventHandler<T = any> = (payload: T, meta: EventMeta) => void;
export type Unsubscribe = () => void;

export class DisposableGroup { constructor(owner?: string); readonly size: number; add<T extends () => void>(dispose: T): T; dispose(): void }
export class EngineEvents {
  constructor(options?: { onError?: (scope: string, error: unknown, detail?: any) => void; now?: () => number });
  on<T = any>(type: string, handler: EventHandler<T>, options?: { owner?: string; once?: boolean }): Unsubscribe;
  once<T = any>(type: string, handler: EventHandler<T>, options?: { owner?: string }): Unsubscribe;
  offOwner(owner: string): number; emit(type: string, payload?: any): number; listenerCount(type: string): number;
  diagnostics(): { total: number; byType: Record<string, number>; byOwner: Record<string, number>; emitted: number; delivered: number; disposed: boolean };
  dispose(): void;
}
export interface TimeSource { now(): number }
export class ManualTimeSource implements TimeSource { constructor(startMs?: number); now(): number; advanceBy(ms: number): number; set(ms: number): number }
export const defaultTimeSource: TimeSource;
export interface ClockOptions { fixedStep?: number; maxSubsteps?: number; maxFrameDelta?: number; mode?: "owned" | "delegated"; timeSource?: TimeSource }
export interface ClockAdvance { substeps: number; alpha: number; paused: boolean; delegated: boolean }
export class EngineClock {
  constructor(options?: ClockOptions);
  fixedStep: number; maxSubsteps: number; mode: "owned" | "delegated"; stepNumber: number; simulationTime: number; alpha: number; paused: boolean;
  onStep: ((dt: number, stepNumber: number) => void) | null;
  reset(): void; pause(): boolean; resume(): boolean; setMode(mode: "owned" | "delegated"): void;
  advance(frameDeltaSeconds: number): ClockAdvance; tick(nowMs?: number): ClockAdvance; step(n?: number): number;
  snapshot(): Readonly<Record<string, any>>;
}
export const LIFECYCLE_STATES: readonly LifecycleState[];
export class LifecycleError extends Error { transition: string; state: string; allowed: string[] }
export class LifecycleManager {
  state: LifecycleState; history: Array<{ from: string; to: string; transition: string; at: number }>;
  plan(transition: string): LifecycleState | null;
  transition(transition: string, work?: (from: LifecycleState, to: LifecycleState) => Promise<void> | void): Promise<boolean>;
  is(...states: LifecycleState[]): boolean; readonly disposed: boolean; snapshot(): Readonly<Record<string, any>>;
}
export interface PluginContext {
  readonly engine: EngineKernel; readonly world: World; readonly events: EngineEvents; readonly metrics: EngineMetrics; readonly clock: EngineClock; readonly config: Record<string, any>;
  log(level: string, message: string, detail?: any): void;
  guard<T>(name: string, factory: (() => Promise<T> | T) | Promise<T>, options?: GuardOptions): Promise<T>;
  addSystem(system: SystemDefinition): () => void; setResource(name: string, value: any): any; getResource(name: string): any;
  own(owner: string): { group: DisposableGroup; on(type: string, handler: EventHandler, options?: { once?: boolean }): Unsubscribe; add<T extends () => void>(dispose: T): T; dispose(): void; readonly size: number };
}
export interface Plugin<H = any> {
  id: string; version?: string; requires?: string[]; optional?: string[]; failurePolicy?: "isolate" | "fatal";
  install(ctx: PluginContext): H | Promise<H>; start?(ctx: PluginContext, handle: H): void | Promise<void>; stop?(ctx: PluginContext, handle: H): void | Promise<void>; dispose?(ctx: PluginContext, handle: H): void | Promise<void>;
}
export class PluginError extends Error { id?: string; cycle?: string[]; missing?: string; duplicate?: boolean }
export class PluginManager {
  register(plugin: Plugin): this; has(id: string): boolean; get(id: string): Plugin | null; handle(id: string): any; status(id: string): PluginStatus | "unregistered";
  resolveOrder(): string[]; installAll(ctx: PluginContext): Promise<Array<{ id: string; status: string; reason?: string; error?: unknown; reused?: boolean }>>;
  startAll(ctx: PluginContext): Promise<any[]>; stopAll(ctx: PluginContext): Promise<any[]>; disposeAll(ctx: PluginContext): Promise<any[]>; clear(): void; rearm(): void;
  diagnostics(): { count: number; order: string[] | null; orderError: string | null; counts: Record<string, number>; plugins: Array<Record<string, any>> };
}
export class EngineMetrics {
  counter(name: string, delta?: number): number; gauge(name: string, value: number): number; record(name: string, ms: number): any; time(name: string): { end(): number };
  measure<T>(name: string, fn: () => Promise<T> | T): Promise<T>; percentile(name: string, p: number): number | null;
  recordError(scope: string, error: unknown, detail?: any): any; recordRecovery(scope: string, detail?: any): any; recordTransition(from: string, to: string, transition: string): void;
  timerSummary(name: string): { count: number; mean: number; min: number; max: number; last: number; p50: number | null; p95: number | null; p99: number | null } | null;
  snapshot(): Readonly<Record<string, any>>; reset(): void; now(): number;
}
export class World {
  constructor(options?: { id?: string }); readonly entityCount: number; revision: number;
  registerComponent(type: string, validate?: (data: any) => boolean): () => void;
  createEntity(label?: string): number; destroyEntity(id: number): boolean; hasEntity(id: number): boolean;
  addComponent<T = any>(id: number, type: string, data?: T): T; getComponent<T = any>(id: number, type: string): T | undefined; removeComponent(id: number, type: string): boolean; query(...types: string[]): IterableIterator<number>;
  setResource<T>(name: string, value: T): T; getResource<T = any>(name: string): T | undefined; hasResource(name: string): boolean; deleteResource(name: string): boolean;
  snapshot(): any; restore(snapshot: any): this; clear(): void;
}
export interface GuardOptions { timeoutMs?: number; fallback?: any | ((error: unknown) => any); required?: boolean }
export interface SystemDefinition { id: string; phase?: SystemPhase; owner?: string; after?: string[]; dispose?: () => void; run(world: World, dt: number, info: any): void }
export interface Scheduler { requestFrame(cb: (nowMs: number) => void): any; cancelFrame(handle: any): void }
export interface EngineOptions { id?: string; clock?: ClockOptions; scheduler?: "auto" | "manual" | Scheduler; log?: (level: string, message: string, detail?: any) => void; world?: { id?: string }; config?: Record<string, any> }
export const SYSTEM_PHASES: readonly SystemPhase[];
export class EngineKernel {
  constructor(options?: EngineOptions);
  readonly authority: Authority; readonly commands: CommandQueue;
  readonly id: string; readonly config: Record<string, any>; readonly events: EngineEvents; readonly metrics: EngineMetrics; readonly lifecycle: LifecycleManager; readonly plugins: PluginManager; readonly clock: EngineClock; readonly world: World; readonly context: PluginContext; frameCount: number;
  use(plugin: Plugin): this; addSystem(system: SystemDefinition): () => void;
  guard<T>(name: string, factory: (() => Promise<T> | T) | Promise<T>, options?: GuardOptions): Promise<T>;
  initialize(): Promise<boolean>; start(): Promise<boolean>; pause(): boolean; resume(): boolean; stop(): Promise<boolean>; dispose(): Promise<boolean>;
  frame(nowMs?: number): ClockAdvance | null; step(n?: number): number; snapshot(): any; restore(snapshot: any): this;
  diagnostics(): Readonly<Record<string, any>>;
}
export function createEngine(options?: EngineOptions): EngineKernel;
export const ZGE_CORE_VERSION: string;

export type AuthorityMode = "LEGACY" | "SHADOW" | "ENGINE";
export const AUTHORITY: Readonly<Record<AuthorityMode, AuthorityMode>>;
export class Authority {
  constructor(features?: Record<string, AuthorityMode>);
  get(domain: string): AuthorityMode; set(domain: string, mode: AuthorityMode): void;
  assertEngine(domain: string): void; snapshot(): Record<string, AuthorityMode>;
}
export interface SimulationCommand { id: string; type: string; [key: string]: any }
export class CommandQueue {
  constructor(authority: Authority, events: EngineEvents);
  register(type: string, domain: string, handler: (world: World, command: SimulationCommand, step: number) => any): () => void;
  enqueue(command: SimulationCommand): boolean; drain(world: World, step: number): void;
  snapshot(): any; restore(snapshot: any): void; dispose(): void;
  readonly results: Map<string, any>;
}
export interface WorldStateSnapshot { schema: 'zge.world-state.v1'; id: string; revision: number; inventoryRevision: number; authority: {domain: string; owner: string; epoch: number}; entities: any[]; buildings: any[]; occupancy: Array<{entityId: string; x: number; z: number; radius: number}>; inventory: Record<string,number>; events: any[] }
export const WORLD_STATE_SCHEMA: 'zge.world-state.v1';
export function plainData<T>(value: T): T;
export function immutableData<T>(value: T): Readonly<T>;
export function createWorldState(options?: Partial<Omit<WorldStateSnapshot,'schema'|'occupancy'>>): Readonly<WorldStateSnapshot>;
export function validateWorldState(state: WorldStateSnapshot): WorldStateSnapshot;
export function serializeWorldState(state: WorldStateSnapshot): string;
export function restoreWorldState(serialized: string): Readonly<WorldStateSnapshot>;
export class AuthorityDomain {
  constructor(options: {domain: string; mode?: AuthorityMode; localFixture?: boolean});
  register(mode: 'LEGACY'|'ENGINE', owner: string, handler: (command: any) => any): () => void;
  transition(mode: AuthorityMode, options?: {validateMigration?: (state: Readonly<any>) => boolean; state?: any; certified?: boolean}): any;
  execute(command: any, options?: {epoch?: number}): any; snapshot(): any; restore(snapshot: any): void; status(): any; dispose(): void;
}

export interface GameplayEventRecord { schema: 'zge.gameplay-event.v1'; id: string; worldId: string; transactionId: string; revision: number; sequence: number; order: number; type: string; authority: {mode: 'ENGINE'; domain: string; owner: string; epoch: number}; [key: string]: unknown }
export const GAMEPLAY_EVENT_SCHEMA: 'zge.gameplay-event.v1';
export function canonicalJSON(value: unknown): string;
export class GameplayEventJournal {
  static transaction(options: {worldId: string; transactionId: string; revision: number; authority: GameplayEventRecord['authority']; events: Array<{type: string; [key: string]: unknown}>; offset?: number}): readonly GameplayEventRecord[];
  static validate(records: readonly GameplayEventRecord[], options?: {offset?: number}): readonly GameplayEventRecord[];
  append(records: readonly GameplayEventRecord[]): number;
  subscribe(id: string, consume: (event: Readonly<GameplayEventRecord>) => void, options?: {replay?: boolean}): () => void;
  snapshot(): readonly GameplayEventRecord[]; restore(records: readonly GameplayEventRecord[], options?: {offset?: number}): void;
  failures(): readonly {subscriber: string; eventId: string; message: string}[]; dispose(): void;
}
