export type Vector3=[number,number,number];
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export interface Transform {position:Vector3;rotation:Vector3;scale:Vector3}
export interface Entity {prefabId?:string;id:string;name:string;components:{transform?:Transform;[type:string]:unknown}}
export interface SceneData {schema:'zge.sdk.scene.v1';id:string;revision:number;nextId:number;entities:Entity[];rules?:Rule[]}
export type FieldType='number'|'boolean'|'string'|'enum'|'vector'|'asset'|'entity';
export interface Field {type:FieldType;label?:string;optional?:boolean;nullable?:boolean;readOnly?:boolean;permission?:string;min?:number;max?:number;maxLength?:number;size?:2|3|4;values?:string[]}
export interface ComponentDefinition {schema:'zge.component.v1';label:string;fields:Record<string,Field>;permission?:string;additionalProperties?:boolean}
export interface Asset {id:string;name?:string;path:string;sha256:string;type?:'json'|'static-model';data?:Json;license?:{source?:string;author?:string;spdx?:string;redistribution?:'unknown'|'permitted'|'restricted'}}
export interface Prefab {name:string;components:Entity['components']}
export interface Project {schema:'zge.sdk.project.v1'|'zge.sdk.project.v2';id:string;name:string;entryWorld:string;worlds:Record<string,SceneData|null>;assets:Asset[];plugins:string[];prefabs?:Record<string,Prefab>;components?:Record<string,ComponentDefinition>;sdkCompatibility?:{major:0;minimumPreview:number};rules?:Rule[];metadata?:Record<string,Json>;provenance?:Json[]}
export interface Operation {type:'CreateEntity'|'CreatePrefabInstance'|'DeleteEntity'|'UpdateTransform'|'AddComponent'|'RemoveComponent'|'UpdateComponent'|'RenameEntity'|'SetRules';id:string;expectedExists:boolean;name?:string;components?:Entity['components'];value?:unknown;component?:string;prefab?:string;transform?:Partial<Transform>;overrides?:Entity['components']}
export interface Changeset {schema:'zge.sdk.changeset.v1';baseRevision:number;operations:Operation[]}
export interface Diff {schema:'zge.sdk.diff.v1';baseRevision:number;rules?:{before:Rule[];after:Rule[]}|null;add:Entity[];remove:Entity[];change:{before:Entity;after:Entity}[]}
export class SDKError extends Error {readonly code:string;readonly path:string|null;constructor(code:string,message:string,path?:string|null)}
export const SDK_VERSION:string;
export function plain<T>(value:T):T;
export function transform(value?:Partial<Transform>):Transform;
export function validateDefinition(def:ComponentDefinition):ComponentDefinition;
export function validateProject(project:Project):Project;
export function migrateProject(project:Project):Project;
export function parseProject(json:string):Project;
export function createProject(options?:{id?:string;name?:string}):Project;
export class Scene {
 constructor(options?:{id?:string;types?:Map<string,(value:unknown)=>boolean>;prefabs?:Record<string,Prefab>;assetIds?:string[]|Set<string>;definitions?:Map<string,ComponentDefinition>});
 readonly revision:number;readonly id:string;readonly canUndo:boolean;readonly canRedo:boolean;
 entities():Entity[];findEntity(id:string|null):Entity|null;serialize():SceneData;restore(data:SceneData):this;validate(data:SceneData):SceneData;
 history():CommitRecord[];subscribe(fn:(event:Record<string,unknown>)=>void):()=>void;clearListeners():void;
 preview(changeset:Changeset):Diff;commit(changeset:Changeset,provenance?:{actor?:string;source?:string}):number;changeset(operations:Operation[]):Changeset;
 createEntity(entity?:{id?:string;name?:string;components?:Entity['components']}):Entity;
 setRules(rules:Rule[],options?:{baseRevision?:number;source?:string}):number;
 batchTransform(ids:string[],offset:Vector3,options?:{baseRevision?:number}):number;
 updateTransform(id:string,value:Partial<Transform>):number;setComponent(id:string,type:string,value:unknown):number;deleteEntity(id:string):number;renameEntity(id:string,name:string):number;duplicateEntity(id:string):Entity;
 createPrefabInstance(prefab:string,id?:string,value?:Partial<Transform>):Entity;instantiatePrefab(options:{prefab:string;id?:string;overrides?:Entity['components']}):Entity;
 undo():number;redo():number;diagnostics():{listeners:number;undo:number;redo:number;history:number;entities:number};
}
export interface EventEnvelope {data:Json;channel:'authoritative'|'visualization';revision:number}
export interface Events {on(type:string,handler:(event:any)=>void):()=>void;emit(type:string,data:Json,channel?:'authoritative'|'visualization'):void}
export interface System {id:string;phase?:'input'|'simulate'|'physics'|'post'|'render';run(scene:Scene,dt:number,info:SystemInfo):void;dispose?():void}
export interface Plugin {id:string;requires?:string[];optional?:string[];failurePolicy?:'isolate'|'fatal';install(engine:Engine):unknown|Promise<unknown>;start?(engine:Engine):unknown;stop?(engine:Engine):unknown;dispose?(engine:Engine):unknown}
export type RendererPreference='none'|'auto'|'webgpu'|'webgl';
export interface Engine {
 readonly version:string;readonly renderer:RendererPreference;readonly project:Project;readonly world:Scene|null;readonly assets:AssetService;readonly events:Events;
 registerComponent(type:string,validate:ComponentDefinition|((value:any)=>boolean),metadata?:ComponentDefinition|null):Engine;
 componentSchemas():Record<string,ComponentDefinition>;editProperties(id:string,type:string,patch:Record<string,unknown>,options?:{principal?:unknown}):number;
 createWorld(id?:string):Scene;loadWorld(id?:string):Promise<Scene>;exportProject():Project;
 prefabStatus(entityId:string):{id:string;overrides:string[]}|null;createPrefab(id:string,entityId:string):Prefab;assetReferences(id:string):{entities:{world:string;entity:string}[];prefabs:string[]};
 importAsset(asset:{id:string;name?:string;path?:string;type?:'json'|'static-model';data:Json;license?:Asset['license']}):Promise<Asset>;
 importModel(asset:{id:string;name?:string;bytes:Uint8Array;hierarchy?:boolean;license?:Asset['license']}):Promise<Asset>;
 assetReference(id:string):Asset;acquireAsset<T=unknown>(id:string,options?:AssetOptions):Promise<AssetLease<T>>;
 attachRenderer(renderer:{render():void;sync?(entities:Entity[]):void;dispose():void}):Engine;
 registerSystem(system:System):()=>void;use(plugin:Plugin):Engine;start():Promise<Engine>;pause():boolean;resume():boolean;step(count?:number):unknown;frame(time?:number):unknown;metrics():EngineMetrics;
 inspectEntity(id:string|null,options?:{principal?:unknown;includePrivate?:boolean}):Entity|null;dispose():Promise<void>;
}
export function createEngine(options?:{project?:Project|string|null;renderer?:RendererPreference;scheduler?:'manual'|'auto';authorize?:(request:{principal:unknown;capability:string;entityId:string})=>boolean}):Promise<Engine>;
export interface AssetOptions {type:string;variant?:string;owner?:string;signal?:AbortSignal;retries?:number;dependencies?:string[]}
export interface AssetLease<T> {id:string;value:T;instantiate():T;release():void}
export interface AssetLoader<T> {load(url:string,options:{signal:AbortSignal;variant:string}):T|Promise<T>;clone(value:T):T;size?(value:T):number;dispose?(value:T):void}
export class AssetService {constructor(options?:{baseURL?:string;budgetBytes?:number;timeoutMs?:number});register<T>(type:string,loader:AssetLoader<T>):void;acquire<T=unknown>(path:string,options:AssetOptions):Promise<AssetLease<T>>;loadDetached<T=unknown>(path:string,options:AssetOptions):Promise<T>;invalidate(path:string,variant?:string,type?:string|null):boolean;status():Record<string,number>;dispose():void}
export interface Proposal {schema:'zge.sdk.proposal.v1';provider:'deterministic-mock-v1';request:string;plan:string[];changeset:Changeset}
export function mockProposal(scene:Scene,options?:{request?:string;kind?:'add'|'move'|'remove'|'objective';entityId?:string|null}):Proposal;
export class ProposalReview {constructor(scene:Scene,proposal:Proposal);readonly status:'pending'|'approved'|'rejected';readonly proposal:Proposal;preview():Diff;reject():void;approve(options?:{approved?:boolean;actor?:string}):number}

export type InteractionRule={id:string;entity:string;kind:"build"|"interact";target:string;sourceEntity:string;sourceComponent:string;component:string;counter:string;property:string;key:"e"|"b";radius:number;cost:number;prefab?:string};
export type Rule=InteractionRule|{id:string;entity:string;kind:"move";speed:number;bounds?:[number,number,number,number]}|{id:string;entity:string;kind:"collect";target:string;component:string;counter:string;radius:number}|{id:string;entity:string;kind:"goal";component:string;property:string;sourceEntity:string;sourceComponent:string;counter:string;threshold:number};
export function validateRules(rules:Rule[]):Rule[];
export function installProjectRules(engine:Engine,input?:Set<string>):()=>void;

export const builtinDefinitions:Record<string,ComponentDefinition>;

export interface CommitRecord {schema:"zge.sdk.commit.v1";revision:number;actor:string;source:string;changeset:Changeset}
export interface SystemInfo {events:Events;stepNumber?:number;simulationTime?:number;frame?:number;alpha?:number;paused?:boolean;frameDelta?:number;delegated?:boolean}
export interface EngineMetrics {id:string;lifecycle:{state:string;[key:string]:unknown};clock:{stepNumber:number;simulationTime:number;paused:boolean;[key:string]:unknown};frameCount:number;systems:{id:string;phase:string;owner:string}[];plugins:Record<string,unknown>;world:{id:string|null;entities:number;revision:number;resources:string[]};metrics:unknown;events:unknown;[key:string]:unknown}

export interface StaticModel {schema:'zge.static-model.v1';sourceFormat:'glb2';sourceBytes:number;vertices:number;triangles:number;dependencies:[];parts:{positions:number[];normals:number[]|null;indices:number[]|null;color:number[];doubleSided:boolean}[]}
export function inspectGLB(bytes:Uint8Array|ArrayBuffer,options?:{hierarchy?:boolean}):StaticModel;
