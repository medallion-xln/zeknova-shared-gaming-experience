export interface CheckpointSnapshot {revision: number; worldId?: string; id?: string; [key: string]: unknown}
export interface CheckpointRequest {operationId: string; expectedVersion: number; snapshot: CheckpointSnapshot}
export interface CheckpointAcknowledgment {ok: boolean; reason?: string; operationId?: string; version: number; revision?: number; durability?: 'adapter-acknowledged'; duplicate?: boolean}
export interface CheckpointEnvelope {schema: 'zge.world-checkpoint.v1'; version: number; snapshot: CheckpointSnapshot; operations: Array<{operationId: string; fingerprint: string; ack: CheckpointAcknowledgment}>}
export const WORLD_CHECKPOINT_SCHEMA: 'zge.world-checkpoint.v1';
export class WorldCheckpointStore {constructor(options: {read?: () => CheckpointEnvelope|null; write: (value: CheckpointEnvelope) => void}); load(): Readonly<CheckpointEnvelope>|null; commit(request: CheckpointRequest): Readonly<CheckpointAcknowledgment>}
export function memoryWorldCheckpoint(): WorldCheckpointStore;
export function localWorldCheckpoint(storage: Pick<Storage, 'getItem'|'setItem'>, key: string): WorldCheckpointStore;
