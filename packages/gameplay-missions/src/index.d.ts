export interface ObjectiveDefinition { id: string; key: string; target: number }
export interface MissionDefinition { id: string; prerequisites?: string[]; objectives: ObjectiveDefinition[]; rewards?: unknown[] }
export interface ObjectiveProgress { id: string; value: number; target: number; complete: boolean }
export interface MissionState { status: 'locked' | 'active' | 'complete'; progress?: ObjectiveProgress[] }
export function evaluateMission(definition: MissionDefinition, state: MissionState, facts: { completed?: string[]; values?: Record<string, number> }): { state: MissionState; events: Array<{ type: 'mission:progress' | 'mission:complete'; id: string; progress: ObjectiveProgress[] }>; rewards: unknown[] };
export function reduceMission(definition: MissionDefinition, state: MissionState & {commands?: Array<{id: string; fingerprint: string}>}, command: {id: string; facts?: {completed?: string[]; values?: Record<string,number>}}): {state: MissionState; events: any[]; rewards: unknown[]; duplicate?: boolean; conflict?: boolean};
