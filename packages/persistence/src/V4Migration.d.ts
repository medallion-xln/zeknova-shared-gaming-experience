export const V4_MIGRATION_SCHEMA: 'zge.v4-world-migration.v1';
export interface V4Migration {schema: typeof V4_MIGRATION_SCHEMA; original: Record<string,any>; sourceCanonical: string; state: import('../../core/src/index.js').WorldStateSnapshot; notes: Record<string,unknown>}
export function migrateV4Save(input: Record<string,any>|V4Migration): Readonly<V4Migration>;
export function validateV4Migration(value: V4Migration): V4Migration;
export function rollbackV4Migration(value: V4Migration): Readonly<Record<string,any>>;
export function persistV4Migration(input: Record<string,any>|V4Migration, write: (value: Readonly<V4Migration>)=>void): Readonly<V4Migration>;
