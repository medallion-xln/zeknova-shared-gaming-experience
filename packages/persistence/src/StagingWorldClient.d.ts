export interface StagingIdentity {worldId: string; token: string}
export class StagingWorldClient {
 constructor(options: StagingIdentity & {endpoint?: string; fetchFn?: typeof fetch; pending?: Record<string,any>[]; persist?: (pending: Record<string,any>[])=>void; eventWindow?: number});
 view: Readonly<import('../../gameplay-construction/src/index.js').RuntimeSnapshot>|null;
 world: Readonly<import('../../core/src/index.js').WorldStateSnapshot>|null;
 pending: Record<string,any>[]; events: readonly import('../../core/src/index.js').GameplayEventRecord[]; cursor: number; serverCursor: number; connected: boolean;
 request(extra?: Record<string,any>): Promise<any>; submit(command: Record<string,any>): Promise<any>; reconnect(): Promise<{ok: boolean; revision: number; pending: number}>;
}
