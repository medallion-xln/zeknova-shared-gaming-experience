import {inspectGLB,validateModel} from './model.js';
export {inspectGLB};
export {installProjectRules} from './rules.js';
import {validateRules} from './rules.js';
export {validateRules};
import {SDKError,fail,validateDefinition,validateFields,builtinDefinitions,migrateProject} from './schema.js';
export {SDKError,validateDefinition,migrateProject,builtinDefinitions};
import { EngineKernel, canonicalJSON } from '../../core/src/index.js';
import { AssetService } from '../../assets/src/AssetService.js';
export { AssetService };
export const SDK_VERSION='0.1.0-preview.13';
const copy=value=>structuredClone(value);
const idOK=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
function requireOK(ok,message){if(!ok)throw new SDKError(message.includes('stale revision')?'REVISION_CONFLICT':message.includes('precondition')?'PRECONDITION':message.includes('component')?'COMPONENT_VALIDATION':message.includes('disposed')?'DISPOSED':'VALIDATION',message);}
export function plain(value){
 const visit=(v,depth=0)=>{requireOK(depth<40,'data nesting limit');if(v===null||typeof v==='boolean'||typeof v==='string')return;
 if(typeof v==='number'){requireOK(Number.isFinite(v),'finite numbers required');return;}
 requireOK(v&&typeof v==='object'&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null),'plain JSON required');
 for(const [k,x] of Object.entries(v)){requireOK(!['__proto__','constructor','prototype'].includes(k),'unsafe key');visit(x,depth+1);}};
 visit(value);requireOK(JSON.stringify(value).length<=4*1024*1024,'scene size limit');return JSON.parse(JSON.stringify(value));
}
const vector=(v,positive=false)=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000&&(!positive||n>0));
export const transform=(value={})=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...plain(value)});
const defaults=()=>new Map([
 ['transform',v=>v&&vector(v.position)&&vector(v.rotation)&&vector(v.scale,true)],
 ['mesh',v=>v&&['box','sphere','cylinder'].includes(v.primitive)&&/^#[0-9a-f]{6}$/i.test(v.color)],
 ['collider',v=>v&&vector(v.halfSize,true)],['state',v=>v&&typeof v==='object'&&!Array.isArray(v)],
 ['asset',v=>v&&idOK(v.id)],['editor',v=>validateFields(v,builtinDefinitions.editor)]
]);
/** Versioned data store with atomic optimistic local transactions. Never connects to PHP/SQL. */
export class Scene {
 #data; #types; #prefabs; #assetIds; #definitions; #undo=[]; #redo=[]; #listeners=new Set(); #history=[];
 constructor({id='main',types=defaults(),prefabs={},assetIds=[],definitions=new Map(Object.entries(builtinDefinitions))}={}){requireOK(idOK(id),'invalid scene id');this.#types=types;this.#prefabs=prefabs;this.#assetIds=assetIds instanceof Set?assetIds:new Set(assetIds);this.#definitions=definitions;this.#data={schema:'zge.sdk.scene.v1',id,revision:0,nextId:1,entities:[]};}
 get revision(){return this.#data.revision;} get id(){return this.#data.id;}
 entities(){return copy(this.#data.entities);} findEntity(id){return copy(this.#data.entities.find(e=>e.id===id)??null);}
 serialize(){return copy(this.#data);} history(){return copy(this.#history);}
 subscribe(fn){this.#listeners.add(fn);return()=>this.#listeners.delete(fn);}
 #publish(event){for(const fn of this.#listeners){try{fn(copy(event));}catch{ /* observer cannot roll back committed state */ }}}
 validate(value){
 const s=plain(value);requireOK(s.schema==='zge.sdk.scene.v1'&&idOK(s.id)&&Number.isSafeInteger(s.revision)&&s.revision>=0&&Number.isSafeInteger(s.nextId)&&s.nextId>0&&Array.isArray(s.entities)&&s.entities.length<=10000,'invalid scene envelope');
 if(s.rules!==undefined){try{validateRules(s.rules);}catch(e){throw new SDKError('RULE_VALIDATION',e.message);}}const ids=new Set(),byId=new Map(s.entities.map(e=>[e.id,e]));for(const e of s.entities){requireOK(idOK(e.id)&&!ids.has(e.id)&&typeof e.name==='string'&&e.name.length<=200&&e.components&&typeof e.components==='object'&&!Array.isArray(e.components),'invalid entity');ids.add(e.id);if(e.prefabId!==undefined)requireOK(idOK(e.prefabId)&&Object.hasOwn(this.#prefabs,e.prefabId),'unknown prefab reference');
 for(const [type,v] of Object.entries(e.components)){requireOK(this.#types.has(type)&&this.#types.get(type)(v)===true,`invalid component ${type}`);if(type==='asset')requireOK(this.#assetIds.has(v.id),'unknown public asset id');}}
 for(const e of s.entities){for(const [type,value] of Object.entries(e.components)){const definition=this.#definitions.get(type);if(definition)requireOK(validateFields(value,definition,{assets:this.#assetIds,entities:ids}),`invalid component references ${type}`);}const visited=new Set([e.id]);let parent=e.components.editor?.parent;while(parent){requireOK(!visited.has(parent),'hierarchy cycle');visited.add(parent);parent=byId.get(parent)?.components.editor?.parent;}}
 for(const id of ids){const m=/^entity-(\d+)$/.exec(id);if(m)requireOK(Number(m[1])<s.nextId,'nextId must exceed generated IDs');}return s;
 }
 restore(value){const valid=this.validate(value);this.#data=valid;this.#undo=[];this.#redo=[];this.#history=[];this.#publish({type:'scene:restore',revision:this.revision});return this;}
 preview(changeset){const before=this.serialize(),after=this.#apply(changeset),old=new Map(before.entities.map(e=>[e.id,e])),next=new Map(after.entities.map(e=>[e.id,e]));return {schema:'zge.sdk.diff.v1',baseRevision:this.revision,add:after.entities.filter(e=>!old.has(e.id)),rules:canonicalJSON(before.rules??[])===canonicalJSON(after.rules??[])?null:{before:before.rules??[],after:after.rules??[]},remove:before.entities.filter(e=>!next.has(e.id)),change:after.entities.filter(e=>old.has(e.id)&&canonicalJSON(old.get(e.id))!==canonicalJSON(e)).map(e=>({before:old.get(e.id),after:e}))};}
 #apply(changeset){
 const c=plain(changeset);requireOK(c.schema==='zge.sdk.changeset.v1'&&c.baseRevision===this.revision&&Array.isArray(c.operations)&&c.operations.length>0&&c.operations.length<=100,'invalid changeset or stale revision');
 const s=this.serialize();for(const op of c.operations){if(op?.type==='SetRules'){requireOK(op.id===this.id&&op.expectedExists===false,'invalid rule document precondition');try{validateRules(op.value);}catch(e){throw new SDKError('RULE_VALIDATION',e.message);}for(const r of op.value){for(const id of [r.entity,r.target,r.sourceEntity].filter(Boolean))requireOK(s.entities.some(e=>e.id===id),'rule entity reference missing');if(r.prefab)requireOK(Object.hasOwn(this.#prefabs,r.prefab),'rule prefab reference missing');const e=s.entities.find(e=>e.id===r.entity),source=s.entities.find(e=>e.id===r.sourceEntity),target=s.entities.find(e=>e.id===r.target);if(r.kind==='move')requireOK(e.components.transform,'movement needs transform');if(r.kind==='collect')requireOK(e.components.transform&&target.components.transform&&Number.isFinite(e.components[r.component]?.[r.counter]),'collection needs transforms and numeric counter');if(r.kind==='goal')requireOK(typeof e.components[r.component]?.[r.property]==='boolean'&&['number','boolean'].includes(typeof source.components[r.sourceComponent]?.[r.counter]),'objective needs boolean state and numeric/boolean counter');if(['build','interact'].includes(r.kind))requireOK(source.components.transform&&target.components.transform&&typeof e.components[r.component]?.[r.property]==='boolean'&&['number','boolean'].includes(typeof source.components[r.sourceComponent]?.[r.counter]),'interaction needs transforms and typed state');}s.rules=copy(op.value);continue;}requireOK(op&&typeof op==='object','invalid operation');const entity=s.entities.find(e=>e.id===op.id);const exists=!!entity;
 requireOK(op.expectedExists===exists,`entity precondition failed: ${op.id}`);
 if(op.type==='CreateEntity'||op.type==='CreatePrefabInstance'){
  requireOK(!exists&&idOK(op.id),'duplicate/invalid entity');let e;
  if(op.type==='CreatePrefabInstance'){requireOK(Object.hasOwn(this.#prefabs,op.prefab),'unknown prefab');e={...copy(this.#prefabs[op.prefab]),id:op.id,prefabId:op.prefab};if(op.overrides)e.components={...e.components,...plain(op.overrides)};if(op.transform)e.components.transform=transform({...e.components.transform,...op.transform});}
  else e={id:op.id,name:op.name??op.id,components:copy(op.components??{})};if(e.components.transform)e.components.transform=transform(e.components.transform);s.entities.push(e);
 }else{requireOK(exists,`entity deleted: ${op.id}`);
 if(op.type==='DeleteEntity')s.entities=s.entities.filter(e=>e.id!==op.id);
 else if(op.type==='RenameEntity'){requireOK(typeof op.name==='string'&&op.name.trim().length>0,'entity name required');entity.name=op.name.trim();}
 else if(op.type==='UpdateTransform'){requireOK(Object.hasOwn(entity.components,'transform'),'missing transform');entity.components.transform={...entity.components.transform,...plain(op.value)};}
 else if(['AddComponent','RemoveComponent','UpdateComponent'].includes(op.type)){
  requireOK(idOK(op.component),'invalid component key');const has=Object.hasOwn(entity.components,op.component);
  requireOK(op.type==='AddComponent'?!has:has,'component precondition failed');if(op.type==='RemoveComponent')delete entity.components[op.component];else entity.components[op.component]=plain(op.value);
 }else throw new SDKError('OPERATION_UNSUPPORTED',`unsupported operation ${op.type}`);}
 const match=/^entity-(\d+)$/.exec(op.id);if(match)s.nextId=Math.max(s.nextId,Number(match[1])+1);
 }s.revision=this.revision+1;return this.validate(s);
 }
 commit(changeset,{actor='local-author',source='human'}={}){const next=this.#apply(changeset);if(canonicalJSON({...next,revision:0})===canonicalJSON({...this.#data,revision:0}))return this.revision;this.#undo.push(this.serialize());if(this.#undo.length>100)this.#undo.shift();this.#redo=[];this.#data=next;
 const record={schema:'zge.sdk.commit.v1',revision:this.revision,actor:String(actor),source:String(source),changeset:plain(changeset)};this.#history.push(record);if(this.#history.length>200)this.#history.shift();this.#publish({type:'scene:commit',...record});return this.revision;}
 changeset(operations){return{schema:'zge.sdk.changeset.v1',baseRevision:this.revision,operations:plain(operations)};}
 createEntity({id=`entity-${this.#data.nextId}`,name=id,components={}}={}){this.commit(this.changeset([{type:'CreateEntity',id,name,components,expectedExists:false}]));return this.findEntity(id);}
 batchTransform(ids,offset,{baseRevision=this.revision}={}){requireOK(Array.isArray(ids)&&ids.length>0&&ids.length<=100&&new Set(ids).size===ids.length&&vector(offset),'1–100 unique IDs and finite local offset required');const operations=ids.map(id=>{const e=this.findEntity(id);requireOK(e?.components.transform&&!e.components.editor?.locked,'all selected entities need unlocked transforms');return{type:'UpdateTransform',id,expectedExists:true,value:{position:e.components.transform.position.map((n,i)=>n+offset[i])}};});return this.commit({schema:'zge.sdk.changeset.v1',baseRevision,operations});}
 setRules(rules,{baseRevision=this.revision,source='human'}={}){return this.commit({schema:'zge.sdk.changeset.v1',baseRevision,operations:[{type:'SetRules',id:this.id,expectedExists:false,value:rules}]},{source});}
 updateTransform(id,value){return this.commit(this.changeset([{type:'UpdateTransform',id,value,expectedExists:true}]));}
 setComponent(id,component,value){return this.commit(this.changeset([{type:Object.hasOwn(this.findEntity(id)?.components??{},component)?'UpdateComponent':'AddComponent',id,component,value,expectedExists:true}]));}
 createPrefabInstance(prefab,id=`entity-${this.#data.nextId}`,value){this.commit(this.changeset([{type:'CreatePrefabInstance',id,prefab,expectedExists:false,...(value?{transform:value}:{})}]));return this.findEntity(id);}
 renameEntity(id,name){return this.commit(this.changeset([{type:'RenameEntity',id,name,expectedExists:true}]));}
 duplicateEntity(id){const original=this.findEntity(id);requireOK(original,'entity does not exist');return this.createEntity({name:original.name+' copy',components:original.components});}
 diagnostics(){return{listeners:this.#listeners.size,undo:this.#undo.length,redo:this.#redo.length,history:this.#history.length,entities:this.#data.entities.length};}
 instantiatePrefab({prefab,id=`entity-${this.#data.nextId}`,overrides={}}){this.commit(this.changeset([{type:'CreatePrefabInstance',id,prefab,overrides,expectedExists:false}]));return this.findEntity(id);}
 deleteEntity(id){return this.commit(this.changeset([{type:'DeleteEntity',id,expectedExists:true}]));}
 #travel(from,to,type){requireOK(from.length>0,`nothing to ${type}`);const target=from.at(-1);this.validate(target);to.push(this.serialize());from.pop();const revision=this.revision+1,nextId=Math.max(this.#data.nextId,target.nextId);this.#data={...copy(target),revision,nextId};this.#publish({type:`scene:${type}`,revision});return revision;}
 undo(){return this.#travel(this.#undo,this.#redo,'undo');} redo(){return this.#travel(this.#redo,this.#undo,'redo');}
 get canUndo(){return this.#undo.length>0;} get canRedo(){return this.#redo.length>0;}
 clearListeners(){this.#listeners.clear();}
}
export function validateProject(value){const p=plain(value);requireOK(['zge.sdk.project.v1','zge.sdk.project.v2'].includes(p.schema)&&idOK(p.id)&&typeof p.name==='string'&&idOK(p.entryWorld)&&p.worlds&&Object.hasOwn(p.worlds,p.entryWorld),'invalid project');
 requireOK(Array.isArray(p.assets)&&Array.isArray(p.plugins),'assets/plugins required');requireOK(p.plugins.every(idOK)&&new Set(p.plugins).size===p.plugins.length&&typeof p.worlds==='object'&&!Array.isArray(p.worlds)&&Object.keys(p.worlds).every(idOK),'invalid project registries');const ids=new Set(),paths=new Set();for(const a of p.assets){requireOK(idOK(a.id)&&!ids.has(a.id)&&!paths.has(a.path)&&typeof a.path==='string'&&a.path.trim()===a.path&&!a.path.includes('%')&&!a.path.includes('//')&&!a.path.endsWith('/')&&!a.path.split('/').includes('.')&&!a.path.includes('..')&&!/[\\:?#]/.test(a.path)&&!a.path.startsWith('/')&&/^[a-f0-9]{64}$/.test(a.sha256),'invalid asset');ids.add(a.id);paths.add(a.path);if(a.type==='static-model'){requireOK(p.schema==='zge.sdk.project.v2'&&p.sdkCompatibility?.minimumPreview>=12,'static models require preview12 compatibility');requireOK(a.data,'embedded model required');requireOK(!a.data.hierarchy||p.sdkCompatibility?.minimumPreview>=13,'hierarchical models require preview13 compatibility');validateModel(a.data);}}const needs13=Object.values(p.worlds).some(w=>w?.rules!==undefined)||(p.rules??[]).some(r=>['build','interact'].includes(r.kind)||r.bounds!==undefined);requireOK(!needs13||(p.schema==='zge.sdk.project.v2'&&p.sdkCompatibility?.minimumPreview>=13),'authored scene rules and interactions require preview13 compatibility');if(p.rules!==undefined){try{validateRules(p.rules);}catch(e){throw new SDKError('RULE_VALIDATION',e.message);}}if(p.schema==='zge.sdk.project.v2'){migrateProject(p);requireOK(p.components&&typeof p.components==='object'&&!Array.isArray(p.components),'component definitions required');for(const def of Object.values(p.components))validateDefinition(def);}return p;}
export function createProject({id='my-project',name='My project'}={}){return validateProject({schema:'zge.sdk.project.v2',sdkCompatibility:{major:0,minimumPreview:13},id,name,entryWorld:'main',worlds:{main:null},components:{},assets:[],prefabs:{},plugins:[],metadata:{},provenance:[]});}
export function parseProject(text){try{return validateProject(migrateProject(JSON.parse(text)));}catch(error){if(error instanceof SDKError)throw error;throw new SDKError('PROJECT_PARSE','Invalid project JSON');}}
async function fetchAssetJSON(url){
 const response=await fetch(url);requireOK(response.ok,'asset fetch failed');const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();throw new SDKError('ASSET_SIZE','asset size limit 1MiB');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new SDKError('ASSET_PARSE','Invalid JSON asset');}
}
export async function createEngine({project=null,renderer='none',scheduler='manual',authorize=()=>false}={}){
 requireOK(['none','auto','webgpu','webgl'].includes(renderer),'invalid renderer');
 if(typeof project==='string'){let url=project.endsWith('.json')?project:project.replace(/\/$/,'')+'/project.json';const r=await fetch(url);requireOK(r.ok,'project fetch failed');project=await r.json();}
 project=project?validateProject(project):{schema:'zge.sdk.project.v1',id:'untitled',name:'Untitled',entryWorld:'main',worlds:{main:null},assets:[],plugins:[],prefabs:{}};
 project=validateProject(migrateProject(project));
 const kernel=new EngineKernel({id:project.id,scheduler}),types=defaults(),definitions=new Map(Object.entries(builtinDefinitions)),worlds=new Map(),assetIds=new Set(project.assets.map(a=>a.id)),assets=new AssetService({baseURL:globalThis.location?.href??'http://localhost/'});for(const [type,definition] of Object.entries(project.components??{})){requireOK(idOK(type)&&!types.has(type),'duplicate component schema');const def=validateDefinition(definition);definitions.set(type,def);types.set(type,value=>validateFields(value,def));}let active=null,disposed=false,presentation=null,disposePending=null;
 const alive=()=>requireOK(!disposed,'engine disposed');
 assets.register('project-json',{load:async url=>{const ref=project.assets.find(a=>new URL(a.path,assets.baseURL).href===url);requireOK(ref,'unknown project asset');const data=ref.data??await fetchAssetJSON(url);if(ref.type==='static-model')validateModel(data);const bytes=new TextEncoder().encode(JSON.stringify(plain(data)));requireOK(bytes.length<=1048576,'asset size limit');const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');requireOK(digest===ref.sha256,'asset hash mismatch');return plain(data);},clone:copy,size:v=>JSON.stringify(v).length});
 const api={version:SDK_VERSION,renderer,project:copy(project),assets,
 componentSchemas(){alive();return Object.fromEntries([...definitions].map(([k,v])=>[k,copy(v)]));},
 registerComponent(type,validate,metadata=null){alive();requireOK(idOK(type)&&!types.has(type),'invalid/duplicate component');if(typeof validate==='object'){const def=validateDefinition(plain(validate));definitions.set(type,def);project.components[type]=def;validate=value=>validateFields(value,def);}else if(metadata){const def=validateDefinition(plain(metadata));definitions.set(type,def);project.components[type]=def;}requireOK(typeof validate==='function','component validator required');types.set(type,validate);return api;},
 createWorld(id='main'){alive();requireOK(!worlds.has(id),'duplicate world');const world=new Scene({id,types,prefabs:project.prefabs??{},assetIds,definitions});worlds.set(id,world);world.subscribe(e=>kernel.events.emit('scene',e));active=world;return world;},
 async loadWorld(id=project.entryWorld){alive();if(worlds.has(id)){active=worlds.get(id);return active;}requireOK(Object.hasOwn(project.worlds,id),'unknown world');const world=new Scene({id,types,prefabs:project.prefabs??{},assetIds,definitions});if(project.worlds[id])world.restore(project.worlds[id]);worlds.set(id,world);world.subscribe(e=>kernel.events.emit('scene',e));active=world;return world;},
 get world(){return active;},
 editProperties(id,type,patch,{principal=null}={}){alive();const def=definitions.get(type),entity=active?.findEntity(id);requireOK(def&&entity?.components[type],'reflected component required');for(const key of Object.keys(patch)){const field=def.fields[key];requireOK(field&&!field.readOnly,'field is read-only or unsupported');requireOK((!field.permission||authorize({principal,capability:field.permission,entityId:id})===true)&&(!def.permission||authorize({principal,capability:def.permission,entityId:id})===true),'field permission denied');}return active.setComponent(id,type,{...entity.components[type],...plain(patch)});},
 exportProject(){alive();const result=copy(project);for(const [id,w] of worlds)result.worlds[id]=w.serialize();if(Object.values(result.worlds).some(w=>w?.rules!==undefined)){result.sdkCompatibility.minimumPreview=13;result.rules=result.worlds[result.entryWorld]?.rules??result.rules??[];}return validateProject(result);},
 prefabStatus(entityId){alive();const e=active?.findEntity(entityId),template=project.prefabs?.[e?.prefabId];return template?{id:e.prefabId,overrides:Object.keys(e.components).filter(k=>canonicalJSON(e.components[k])!==canonicalJSON(template.components[k]))}:null;},
 createPrefab(id,entityId){alive();requireOK(idOK(id)&&!Object.hasOwn(project.prefabs??{},id),'prefab ID must be new');const e=active?.findEntity(entityId);requireOK(e,'entity does not exist');project.prefabs??={};if(e.components.editor)e.components.editor.parent=null;project.prefabs[id]={name:e.name,components:e.components};kernel.events.emit('project:changed',{kind:'prefab',id});return copy(project.prefabs[id]);},
 assetReferences(id){alive();return{entities:[...worlds.values()].flatMap(w=>w.entities().filter(e=>Object.entries(e.components).some(([type,c])=>Object.entries(definitions.get(type)?.fields??{}).some(([key,f])=>f.type==='asset'&&c[key]===id))).map(e=>({world:w.id,entity:e.id}))),prefabs:Object.entries(project.prefabs??{}).filter(([,p])=>Object.entries(p.components??{}).some(([type,c])=>Object.entries(definitions.get(type)?.fields??{}).some(([key,f])=>f.type==='asset'&&c[key]===id))).map(([name])=>name)};},
 async importAsset({id,name=id,path=`imports/${id}.json`,data,type='json',license={redistribution:'unknown'}}){alive();requireOK(['json','static-model'].includes(type)&&idOK(id)&&!assetIds.has(id),'unique supported asset ID required');data=plain(data);if(type==='static-model')validateModel(data);const bytes=new TextEncoder().encode(JSON.stringify(data));requireOK(bytes.length<=1048576,'asset size limit 1MiB');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');alive();requireOK(!assetIds.has(id),'duplicate asset after asynchronous import');const asset={id,name,path,type,data,sha256:hash,license:plain(license)};const compatibility={...project.sdkCompatibility,minimumPreview:Math.max(project.sdkCompatibility.minimumPreview,type==='static-model'?(data.hierarchy?13:12):0)};validateProject({...project,sdkCompatibility:compatibility,assets:[...project.assets,asset]});project.sdkCompatibility=compatibility;project.assets.push(asset);assetIds.add(id);kernel.events.emit('project:changed',{kind:'asset',id});return copy(asset);},
 async importModel({id,name=id,bytes,hierarchy=false,license={redistribution:'unknown'}}){alive();const data=inspectGLB(bytes,{hierarchy});const sourceSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');return api.importAsset({id,name,type:'static-model',path:`imports/${id}.model.json`,data:{...data,sourceSha256},license});},
 assetReference(id){alive();const ref=project.assets.find(a=>a.id===id);requireOK(ref,'unknown public asset id');return copy(ref);},
 acquireAsset(id,options={type:'project-json'}){const ref=api.assetReference(id);return assets.acquire(ref.path,options);},
 attachRenderer(backend){alive();requireOK(!presentation&&backend&&typeof backend.render==='function'&&typeof backend.dispose==='function','one owned presentation backend required');presentation=backend;return api;},
 registerSystem({id,phase='simulate',run,dispose}){alive();requireOK(typeof run==='function','system callback required');return kernel.addSystem({id,phase,run:(_world,dt,info)=>run(active,dt,{...info,events:api.events}),dispose});},
 use(plugin){alive();requireOK(kernel.lifecycle.state==='created','plugins register before start');kernel.use({...plugin,install:()=>plugin.install(api),start:plugin.start?()=>plugin.start(api):undefined,stop:plugin.stop?()=>plugin.stop(api):undefined,dispose:plugin.dispose?()=>plugin.dispose(api):undefined});return api;},
 events:{on:(type,fn)=>{alive();return kernel.events.on(type,fn);},emit:(type,data,channel='authoritative')=>{alive();requireOK(['authoritative','visualization'].includes(channel),'invalid event channel');kernel.events.emit(type,{data:plain(data),channel,revision:active?.revision??0});}},
 async start(){alive();if(!active)await api.loadWorld();await kernel.start();return api;},pause(){alive();return kernel.pause();},resume(){alive();return kernel.resume();},
 step(count=1){alive();requireOK(kernel.lifecycle.state==='paused'&&Number.isInteger(count)&&count>0&&count<=120,'step requires pause and 1..120 steps');return kernel.step(count);},
 frame(time){alive();const result=kernel.frame(time);presentation?.sync?.(active?.entities()??[]);presentation?.render();return result;},metrics(){alive();const diagnostics=kernel.diagnostics();return{...diagnostics,world:{...diagnostics.world,id:active?.id??null,entities:active?.entities().length??0,revision:active?.revision??0}};},
 inspectEntity(id,{principal=null,includePrivate=false}={}){alive();const entity=active?.findEntity(id);if(!entity)return null;for(const key of ['player','team','ai'])if(Object.hasOwn(entity.components,key)&&(!includePrivate||authorize({principal,capability:`inspect.${key}`,entityId:id})!==true))delete entity.components[key];for(const [type,def] of definitions)if(def.permission&&Object.hasOwn(entity.components,type)&&authorize({principal,capability:def.permission,entityId:id})!==true)delete entity.components[type];for(const [type,def] of definitions)if(entity.components[type])for(const [key,field] of Object.entries(def.fields))if(field.permission&&authorize({principal,capability:field.permission,entityId:id})!==true)delete entity.components[type][key];return entity;},
 async dispose(){if(disposed)return;if(disposePending)return disposePending;disposePending=(async()=>{try{await kernel.dispose();}finally{for(const w of worlds.values())w.clearListeners();worlds.clear();assets.dispose();presentation?.dispose();presentation=null;disposed=true;}})();return disposePending;}
 };return Object.freeze(api);
}
/** Mock only: structured deterministic fixture, with no natural-language inference. */
export function mockProposal(scene,{request='Add a supply crate',kind='add',entityId=null}={}){
 const id=`entity-${scene.serialize().nextId}`;let operations;
 if(kind==='objective'){requireOK(scene.findEntity('objective')&&scene.findEntity('console'),'Objective fixture requires the Haven project');operations=[{type:'SetRules',id:scene.id,expectedExists:false,value:[...(scene.serialize().rules??[]).filter(r=>r.id!=='objective'),{id:'objective',kind:'goal',entity:'objective',component:'state',property:'complete',sourceEntity:'console',sourceComponent:'state',counter:'online',threshold:1}]}];}
 else if(kind==='remove')operations=[{type:'DeleteEntity',id:entityId,expectedExists:true}];
 else if(kind==='move')operations=[{type:'UpdateTransform',id:entityId,expectedExists:true,value:{position:[3,.5,2]}}];
 else{requireOK(kind==='add','unknown mock fixture');operations=[{type:'CreateEntity',id,name:'Proposed supply crate',expectedExists:false,components:{transform:transform({position:[3,.5,2]}),mesh:{primitive:'box',color:'#e2ab55'}}}];}
 return{schema:'zge.sdk.proposal.v1',provider:'deterministic-mock-v1',request:String(request),plan:[`${kind} fixture; explicit approval required`],changeset:scene.changeset(operations)};
}
export class ProposalReview {
 #scene;#proposal;#status='pending';
 constructor(scene,proposal){requireOK(proposal?.schema==='zge.sdk.proposal.v1'&&proposal.provider==='deterministic-mock-v1'&&typeof proposal.request==='string'&&Array.isArray(proposal.plan),'invalid proposal');this.#scene=scene;this.#proposal=plain(proposal);}
 get status(){return this.#status;} get proposal(){return copy(this.#proposal);}
 preview(){requireOK(this.#status==='pending','proposal closed');return this.#scene.preview(this.#proposal.changeset);}
 reject(){requireOK(this.#status==='pending','proposal closed');this.#status='rejected';}
 approve({approved=false,actor='local-author'}={}){requireOK(approved===true&&this.#status==='pending','explicit approval required');const revision=this.#scene.commit(this.#proposal.changeset,{actor,source:this.#proposal.provider});this.#status='approved';return revision;}
}
