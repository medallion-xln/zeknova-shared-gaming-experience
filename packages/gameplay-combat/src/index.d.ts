export interface StatusEffect { type: string; ticks?: number; [key: string]: unknown }
export interface CombatTarget { id: string; health: number; effects?: StatusEffect[]; [key: string]: unknown }
export interface DamageCommand { targetId: string; sourceId: string; amount: number; effects?: StatusEffect[] }
export interface DamageResult { ok: boolean; reason?: string; state?: CombatTarget; damage?: number; events?: Array<{ type: 'combat:damage' | 'combat:death'; targetId: string; sourceId: string; damage?: number; health?: number }> }
export function evaluateDamage(target: CombatTarget, command: DamageCommand, options?: { validateHit?: (target: CombatTarget, command: DamageCommand) => boolean; projectileOwner?: string | null }): DamageResult;
export interface CombatState { targets: CombatTarget[]; ledger?: Array<{id: string; fingerprint: string}>; revision?: number; events?: any[] }
export function reduceCombat(state: CombatState, command: DamageCommand & {id: string}, options?: Parameters<typeof evaluateDamage>[2]): {ok: boolean; state: CombatState; events: any[]; reason?: string; damage?: number; duplicate?: boolean};
