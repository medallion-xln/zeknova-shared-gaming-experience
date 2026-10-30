import type {Engine} from './index.js';
export const MOVEMENT_SCHEMA:'zge.movement.v1';
export const EVASION_SCHEMA:'zge.evasion.v1';
export interface DashConfig {speed:number;durationMs:number;cooldownMs:number;invulnerableMs:number;airDashes:number}
export interface MovementConfig {schema:typeof MOVEMENT_SCHEMA;speed:number;acceleration:number;deceleration:number;airControl:number;gravity:number;jumpVelocity:number;maxJumps:number;groundY:number;restEpsilon:number;dash:Readonly<DashConfig>}
export type MovementOptions=Partial<Omit<MovementConfig,'dash'>>&{dash?:Partial<DashConfig>};
export interface MovementBasis {forward:number[];right:number[]}
export type MovementOrientation=MovementBasis|{getMovementBasis():MovementBasis};
export interface EvasionWindow {schema:typeof EVASION_SCHEMA;sequence:number;inputSequence:number;startedAtMs:number;endsAtMs:number;durationMs:number;earliestNextMs:number;authority:'client-feel';claim:'damage-negation'}
export interface MovementState {x:number;y:number;z:number;vx:number;vy:number;vz:number;facingX:number;facingZ:number;grounded:boolean;jumpsUsed:number;airDashesUsed:number;dashUntilMs:number;dashReadyAtMs:number;dashDirX:number;dashDirZ:number;timeMs:number;sequence:number;evasionSequence:number;lastEvasion:EvasionWindow|null}
export interface MovementInput {forward?:number;strafe?:number;jump?:boolean;dash?:boolean;basis?:MovementBasis}
export interface MovementEvent {type:string;ordinal?:number;double?:boolean;direction?:number[];evasion?:EvasionWindow;at?:number[]}
export const DEFAULT_MOVEMENT:Readonly<MovementConfig>;
export const MOVEMENT_AUTHORITY:Readonly<{plugin:'movement';clientAuthoritative:readonly string[];serverValidated:readonly string[];claims:readonly string[];note:string}>;
export function validateMovementConfig(config?:MovementOptions):Readonly<MovementConfig>;
export function createMovementState(options?:{x?:number;y?:number;z?:number;config?:MovementOptions}):MovementState;
export function stepMovement(state:MovementState,input:MovementInput,dtSeconds:number,config?:MovementOptions):{state:MovementState;events:MovementEvent[];dashing:boolean;invulnerable:boolean};
export function validateEvasionWindow(window:unknown,options?:{config?:MovementOptions;previous?:EvasionWindow|null;nowMs?:number|null;toleranceMs?:number}):{ok:boolean;reason:string|null;coversMs?:number[];[key:string]:unknown};
export function evasionCovers(window:EvasionWindow|null,atMs:number):boolean;
export interface MovementController {readonly config:Readonly<MovementConfig>;readonly authority:typeof MOVEMENT_AUTHORITY;readonly state:MovementState|null;readonly lastEvasion:EvasionWindow|null;dispose():void}
export function installMovement(engine:Engine,options?:{entity?:string;input?:Set<string>;orientation?:MovementOrientation|null;config?:MovementOptions;keys?:Partial<Record<'forward'|'back'|'left'|'right'|'jump'|'dash',string[]>>}):MovementController;
