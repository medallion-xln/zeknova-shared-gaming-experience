export class SDKError extends Error {
 constructor(code,message,path=null){super(message);this.name='SDKError';this.code=code;this.path=path;}
}
export const fail=(code,message,path=null)=>{throw new SDKError(code,message,path);};
export function validateDefinition(def){
 if(!def||def.schema!=='zge.component.v1'||typeof def.label!=='string'||!def.fields||Array.isArray(def.fields))fail('COMPONENT_SCHEMA','Invalid component definition');
 for(const [key,f] of Object.entries(def.fields)){
  if(!/^[a-zA-Z][\w-]{0,60}$/.test(key)||!f||!['number','boolean','string','enum','vector','asset','entity'].includes(f.type))fail('COMPONENT_SCHEMA','Unsupported reflected field',key);
  if(f.type==='enum'&&(!Array.isArray(f.values)||!f.values.length||f.values.some(v=>typeof v!=='string')))fail('COMPONENT_SCHEMA','Enumeration values required',key);
  if(f.type==='vector'&&f.size!==undefined&&![2,3,4].includes(f.size))fail('COMPONENT_SCHEMA','Vector size must be 2–4',key);
  if(f.min!==undefined&&!Number.isFinite(f.min)||f.max!==undefined&&!Number.isFinite(f.max))fail('COMPONENT_SCHEMA','Finite field bounds required',key);
 }
 return structuredClone(def);
}
export function validateFields(value,definition,{assets=null,entities=null}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 for(const [key,f] of Object.entries(definition.fields)){
  const v=value[key];if(v===undefined&&f.optional)continue;if(v===null&&f.nullable)continue;
  if(f.type==='number'&&!(Number.isFinite(v)&&(f.min===undefined||v>=f.min)&&(f.max===undefined||v<=f.max)))return false;
  if(f.type==='boolean'&&typeof v!=='boolean')return false;
  if(['string','enum','asset','entity'].includes(f.type)&&typeof v!=='string')return false;
  if(f.type==='string'&&v.length>(f.maxLength??1000))return false;
  if(f.type==='enum'&&!f.values.includes(v))return false;
  if(f.type==='vector'&&(!Array.isArray(v)||v.length!==(f.size??3)||v.some(n=>!Number.isFinite(n)||(f.min!==undefined&&n<f.min)||(f.max!==undefined&&n>f.max))))return false;
  if(f.type==='asset'&&assets&&!assets.has(v))return false;
  if(f.type==='entity'&&entities&&!entities.has(v))return false;
 }
 return definition.additionalProperties!==false||Object.keys(value).every(k=>Object.hasOwn(definition.fields,k));
}
const field=(type,label,extra={})=>({type,label,...extra});
export const builtinDefinitions={
 transform:{schema:'zge.component.v1',label:'Transform',fields:{position:field('vector','Position'),rotation:field('vector','Rotation (radians)'),scale:field('vector','Scale',{min:.00001})}},
 mesh:{schema:'zge.component.v1',label:'Primitive',fields:{primitive:field('enum','Shape',{values:['box','sphere','cylinder']}),color:field('string','Color',{maxLength:7})}},
 collider:{schema:'zge.component.v1',label:'Box collider',fields:{halfSize:field('vector','Half size',{min:.00001})}},
 state:{schema:'zge.component.v1',label:'Project state',fields:{}},asset:{schema:'zge.component.v1',label:'Asset reference',fields:{id:field('asset','Asset')}},
 editor:{schema:'zge.component.v1',label:'Hierarchy',fields:{parent:field('entity','Parent',{nullable:true}),hidden:field('boolean','Hidden'),locked:field('boolean','Locked'),group:field('string','Group',{maxLength:100})}}
};
export function migrateProject(input){
 const p=structuredClone(input);
 if(p?.schema==='zge.sdk.project.v1')return{...p,schema:'zge.sdk.project.v2',sdkCompatibility:{major:0,minimumPreview:11},components:p.components??{},metadata:p.metadata??{},provenance:[...(p.provenance??[]),{sourceSchema:'zge.sdk.project.v1',migration:'project-v1-to-v2'}]};
 if(p?.schema!=='zge.sdk.project.v2')fail('PROJECT_VERSION','Unsupported project schema');
 if(p.sdkCompatibility?.major!==0||!Number.isInteger(p.sdkCompatibility.minimumPreview)||p.sdkCompatibility.minimumPreview<0||p.sdkCompatibility.minimumPreview>13)fail('SDK_VERSION','Project requires an unsupported SDK version');
 return p;
}
