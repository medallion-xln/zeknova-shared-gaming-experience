import type {Engine,Entity} from './index.js';
import type {MovementBasis} from './movement.js';
export type CameraMode='isometric'|'over-shoulder'|'third-person';
export const MODES:readonly CameraMode[];
export const CAMERA_PRESET_SCHEMA:'zge.camera.presets.v1';
export interface CameraPreset {schema:typeof CAMERA_PRESET_SCHEMA;defaultMode?:CameraMode;enabledModes?:CameraMode[];followDistance?:number;elevation?:number;offset?:number;fov?:number;orthoScale?:number;sensitivity?:number;pitchLimits?:[number,number];smoothing?:number;transitionDuration?:number}
export interface CameraPose {projection:'perspective'|'orthographic';position:number[];target:number[];fov?:number;distance?:number;orthoScale?:number}
export interface CameraDirector {readonly mode:CameraMode;readonly target:string|null;readonly transitionDuration:number;readonly collision:boolean;readonly enabledModes:CameraMode[];readonly sensitivity:number|null;readonly pitchLimits:[number,number]|null;readonly smoothing:number|null;setMode(mode:CameraMode):this;follow(entity:string|null):this;setTransitionDuration(seconds:number):this;setLook(yaw:number,pitch:number,distance?:number):this;update(now?:number):CameraPose|null;on(fn:(type:string,data:unknown)=>void):()=>void;bindMovementBasis(holder:MovementBasis):this;getMovementBasis():MovementBasis;setCollision(enabled:boolean):this;applyPreset(preset:CameraPreset):this;dispose():void}
export function validateCameraPreset(value:CameraPreset|null):CameraPreset|null;
export function resolveOcclusion(target:number[],cameraPosition:number[],entities:Entity[],targetId:string|null,clearance?:number):{position:number[];hit:boolean};
export function createCameraDirector(engine:Engine,options?:{transitionDuration?:number;collision?:boolean;collisionClearance?:number;preset?:CameraPreset}):CameraDirector;
