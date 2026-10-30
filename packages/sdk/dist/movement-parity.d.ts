import type {MovementInput,MovementOptions,MovementState,MovementEvent} from './movement.js';
export const MOVEMENT_PARITY_CLASSES:readonly string[];
export interface MovementSample {frame:number;x:number;y?:number;z:number}
export interface MovementRun {samples:MovementSample[];releasedAtFrame?:number|null;unobservable?:string[]}
export interface MovementObservation {scriptId?:string;legacy?:MovementRun;rebuilt?:MovementRun;capabilities?:Record<string,boolean>;tolerances?:Partial<MovementTolerances>;reproduce?:string}
export interface MovementTolerances {responseFrames:number;displacementRatio:number;restDrift:number;trajectory:number;settleFrames:number}
export interface MovementComparison {scriptId:string|null;matched:boolean;differences:{classification:string;detail:Record<string,unknown>}[];mismatches:number;unobservable:string[];fullyObservable:boolean;tolerances:MovementTolerances;reproduce:string}
export function responseFrames(samples:MovementSample[],epsilon?:number):number|null;
export function displacement(samples:MovementSample[]):number;
export function compareMovement(observation:MovementObservation):MovementComparison;
export function replayScript(script:(MovementInput&{frames:number})[],options?:{config?:MovementOptions;dtSeconds?:number;start?:{x:number;y:number;z:number}}):MovementRun&{finalState:MovementState;events:(MovementEvent&{frame:number})[]};
export class MovementParityReport {constructor(options?:{limit?:number});record(observation:MovementObservation):MovementComparison;snapshot():{schema:'zge.movement-parity.v1';total:number;matched:number;mismatched:number;unobservable:number;classes:Record<string,number>;rows:MovementComparison[]}}
