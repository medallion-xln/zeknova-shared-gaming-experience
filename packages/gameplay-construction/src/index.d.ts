export interface BuildingDefinition { type: string; radius?: number; cost?: Record<string, number> }
export interface PlacementRequest { id: string; type: string; x: number; z: number; rotation?: number }
export type ConstructionCommand = (PlacementRequest & { commandId: string; expectedRevision?: number; expectedInventoryRevision?: number; action: 'place' }) | { commandId: string; action: 'remove'; id: string } | {commandId: string; action: 'grant'; amounts: Record<string,number>};
export interface BuildingRecord extends PlacementRequest { y: number; radius: number; level: number; state: 'complete' }
export interface TerrainPolicy {
  isValid(definition: BuildingDefinition, x: number, z: number): boolean;
  heightAt(definition: BuildingDefinition, x: number, z: number): number;
  rotationAt?(definition: BuildingDefinition, x: number, z: number): number;
}
export interface ConstructionResult { ok: boolean; reason?: string; cost?: Record<string, number>; building?: BuildingRecord; shortfalls?: Record<string, number>; amounts?: Record<string,number> }
export type ConstructionEvent = { type: 'construction:placed' | 'construction:removed'; commandId: string; building: BuildingRecord } | {type: 'resources:granted'; commandId: string; amounts: Record<string,number>};
export interface ConstructionSnapshot { version: 2; revision: number; inventoryRevision: number; pending: ConstructionCommand[]; inventory: Record<string, number>; buildings: BuildingRecord[]; ledger: Array<{ commandId: string; command: ConstructionCommand; result: ConstructionResult; fingerprint?: string; before: Pick<ConstructionSnapshot, 'revision' | 'inventoryRevision' | 'inventory' | 'buildings' | 'events'> }>; events: ConstructionEvent[] }
export interface ConstructionOptions { definitions: BuildingDefinition[]; inventory?: Record<string, number>; terrain: TerrainPolicy; costFor?: (definition: BuildingDefinition, request: PlacementRequest) => Record<string, number>; snapshot?: ConstructionSnapshot; beforeCommit?: (snapshot: Readonly<ConstructionSnapshot>, result: Readonly<ConstructionResult>) => void }
export function evaluatePlacement(options: { definitions: BuildingDefinition[]; state: { inventory: Record<string, number>; buildings: BuildingRecord[] }; request: PlacementRequest; terrain: TerrainPolicy; costFor?: ConstructionOptions['costFor'] }): ConstructionResult;
export class Construction {
  constructor(options: ConstructionOptions); evaluate(request: PlacementRequest): ConstructionResult;
  execute(command: ConstructionCommand | { action: 'remove'; id: string; commandId: string }): ConstructionResult;
  stage(command: ConstructionCommand): string; recoverPending(options?: {commit?: boolean}): ConstructionResult[]; worldState(authority?: {domain: string; owner: string; epoch: number}): import('../../core/src/index.js').WorldStateSnapshot;
  snapshot(): ConstructionSnapshot; restore(snapshot: ConstructionSnapshot): this; rollback(commandId: string): void; replay(commands: ConstructionCommand[]): ConstructionResult[]; dispose(): void;
}
export function dispatchConstruction(options: { authority: { get(domain: string): string }; construction: Construction; command: ConstructionCommand; legacy(command: ConstructionCommand): any }): any;
export function installConstruction(engine: import('../../core/src/index.js').EngineKernel, options: ConstructionOptions): { construction: Construction; restore(snapshot: ConstructionSnapshot): void; dispose(): void };

export function utilityStatus(records: BuildingRecord[], type: string, x: number, z: number, rules: {source: Record<string,string>; range: Record<string,number>; requirements: Record<string,string[]>}, excludeId?: string | null): {ok: boolean; connections: Array<{utility: string; sourceId: string | null}>; missing: string[]};
export interface ParityRow { fixtureId: string; matched: boolean; differences: Array<{classification: string; detail: any}>; unobservable: string[]; fullyObservable: boolean }
export function compareConstruction(observation: Record<string, any>): ParityRow;
export class ConstructionParityReport { constructor(options?: {limit?: number}); record(observation: Record<string, any>): ParityRow; snapshot(): any }
export const PARITY_CLASSES: readonly string[];

/** Independent source world, never an implicit live legacy authority switch. */
export interface RuntimeCommand {commandId: string; action: 'place'|'remove'|'grant'|'move'|'select'; expectedRevision?: number; [key: string]: unknown}
export interface RuntimeResult {ok: boolean; reason?: string; transactionId?: string; revision: number; eventIds?: readonly string[]; [key: string]: unknown}
export interface RuntimeSnapshot {schema: 'zge.construction-runtime.v1'|'zge.construction-runtime.v2'; checkpoint?: {revision: number; built: number; eventSequence: number; state: Omit<RuntimeSnapshot,'schema'|'checkpoint'|'ledger'|'events'>}; worldId: string; revision: number; construction: ConstructionSnapshot; player: {id: string; x: number; y: number; z: number; radius: number; xp: number}; selectedType: string|null; mission: Record<string, unknown>; built: number; rewardIds: string[]; ledger: Array<{command: RuntimeCommand; fingerprint: string; result: RuntimeResult}>; events: import('../../core/src/index.js').GameplayEventRecord[]}
export interface RuntimeOptions extends Omit<ConstructionOptions, 'beforeCommit'> {worldId?: string; owner?: string; epoch?: number; player?: RuntimeSnapshot['player']; mission?: {id: string; objectives: Array<{id: string; key: string; target: number}>; rewards?: Array<{xp?: number}>}; canWalk?: (x: number,z: number) => boolean; beforeCommit?: (snapshot: Readonly<RuntimeSnapshot>, result: Readonly<RuntimeResult>) => void}
export class ConstructionRuntime {
  constructor(options: RuntimeOptions); dispatch(command: RuntimeCommand): Readonly<RuntimeResult>;
  snapshot(): Readonly<RuntimeSnapshot>; restore(snapshot: RuntimeSnapshot): this;
  compact(options: {receiptsArchived: true}): Readonly<RuntimeSnapshot>;
  worldState(): import('../../core/src/index.js').WorldStateSnapshot; replay(): {deterministic: boolean; transactions: number};
  subscribe(id: string, consume: (event: import('../../core/src/index.js').GameplayEventRecord) => void, options?: {replay?: boolean}): () => void;
  failures(): readonly {subscriber: string; eventId: string; message: string}[]; dispose(): void;
}
export class ConstructionServerFixture {
  constructor(options: {options: RuntimeOptions; store?: {load(): any; commit(request: any): any}; identities?: Record<string,string>});
  handle(request: {clientId: string; token: string; command?: RuntimeCommand|null}): Readonly<Record<string, any>>; snapshot(): Readonly<RuntimeSnapshot>;
}
export class ConstructionFixtureClient {
  constructor(options: {clientId: string; token: string; send: (request: any) => Promise<any>; pending?: RuntimeCommand[]; persist?: (pending: readonly RuntimeCommand[]) => void});
  view: Readonly<RuntimeSnapshot>|null; version: number; connected: boolean; reconcile(): Promise<any>; submit(command: RuntimeCommand): Promise<any>; reconnect(): Promise<any[]>; pending(): readonly RuntimeCommand[];
}
