import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {CONSTRUCTION_CATALOG,evaluateZekNovaPlacement,UTILITY_RULES} from '../../../src/game/construction/policy.js';
import {ConstructionParityReport} from '../src/index.js';
const source=readFileSync(new URL('../../../assets/index-02987539.js',import.meta.url),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const aid=between('zkZeknovanAidDefinitions=','\nzkZeknovanAidTypes=').replace(/,\s*$/,'');
const catalog=between('eo=[{','\nzkUtilityNetwork=').replace(/,\s*$/,'');
const utilities=between('function zkOperationalRecord','function zkDisposeUtilityLinks');
const klass=between('class LR{','createModel(e,t){')+'createModel(){return {}}}';
const assignment=(prefix,end)=>between(prefix,end).trim();
const site=assignment('LR.prototype.isValidSite=function','\nLR.prototype.addRecord=function');
const height=assignment('LR.prototype.siteHeight=function','\nfunction zkNearSurfaceWater');
const progression=source.slice(source.indexOf('LR.prototype.place=function(...args)'),source.indexOf('\n',source.indexOf('LR.prototype.place=function(...args)')));
const aidPlace=source.slice(source.indexOf('LR.prototype.place=function(point,resources,terrain)'),source.indexOf('\n',source.indexOf('LR.prototype.place=function(point,resources,terrain)')));
const ctx=vm.createContext({Ge:class{add(){}},Be:{waterLevel:-.35},crypto:{randomUUID:()=> 'controlled-id'},Math:Object.assign(Object.create(Math),{random:()=>.25}),zkUtilityNetwork:UTILITY_RULES});
vm.runInContext(`let ${aid};let ${catalog};${klass};const zkOriginalBuildingSite=LR.prototype.isValidSite,zkOriginalBuildingHeight=LR.prototype.siteHeight;${utilities};${site};${height};const zkProgressionPlace=LR.prototype.place;${progression};const zkAidProject=t=>zkZeknovanAidDefinitions.find(d=>d.type===t);const zkAidPlace=LR.prototype.place;${aidPlace};globalThis.Legacy=LR;globalThis.catalog=eo;`,ctx);
const actualCatalog=JSON.parse(JSON.stringify(ctx.catalog));
const report=new ConstructionParityReport({limit:1000});
const baseRecord=(id,type,x,z)=>({id,type,x,y:1,z,rotation:0,level:1,health:1000});
const scenarios=['valid','resources','outside','slope','height','occupied','no-utility','broken-source','aid-cooldown'];
test('actual patched LR catalog, costs, utilities, terrain and callbacks match detached policy across 702 cases',()=>{
 assert.deepEqual(actualCatalog.map(d=>({type:d.type,cost:d.cost})),CONSTRUCTION_CATALOG.map(d=>({type:d.type,cost:d.cost})));
 for(const rank of ['ensign','lieutenant','captain'])for(const definition of CONSTRUCTION_CATALOG)for(const scenario of scenarios){
  const id=`${rank}/${definition.type}/${scenario}`,inventory=Object.fromEntries(['minerals','credits','iron','biomass','energy','data','trust'].map(k=>[k,scenario==='resources'?0:1000]));
  const records=scenario==='no-utility'?[]:[baseRecord('power','power',0,0),baseRecord('water','water',0,5),baseRecord('data','communications',5,0)];if(scenario==='broken-source')records[0].health=0;
  const request={id:'controlled-id',type:definition.type,x:scenario==='outside'?1000:10,z:10};if(definition.type!=='bridge')request.rotation=Math.PI/2;
  const facts={request,officerClass:rank,inventory,records,aidCooldownRemaining:scenario==='aid-cooldown'?1000:0,terrain:{worldSize:180,waterLevel:-.35,height:scenario==='height'?-1:1,heights:scenario==='slope'?[6,0,0,0]:[1,1,1,1],obstacles:scenario==='occupied'?[{x:10,z:10,radius:2}]:[],waterInfrastructure:true,bridgeHeight:2,bridgeRotation:.6}};
  const t={isBuildable:(x,z)=>{if(Math.abs(x)>82.8||Math.abs(z)>82.8||facts.terrain.obstacles.length)return false;if(facts.terrain.height<.45||facts.terrain.height>18)return false;return Math.abs(facts.terrain.heights[0]-facts.terrain.heights[1])+Math.abs(facts.terrain.heights[2]-facts.terrain.heights[3])<3.3;},isHabitatSite:(x,z)=>Math.abs(x)<=82.8&&Math.abs(z)<=82.8&&!facts.terrain.obstacles.length&&facts.terrain.height>=.45&&facts.terrain.height<=18,isWaterInfrastructureSite:(x,z)=>Math.abs(x)<=81&&Math.abs(z)<=81,heightAt:()=>facts.terrain.height,bridgeDeckHeightAt:()=>2,bridgeRotationAt:()=>.6};
  const legacy=new ctx.Legacy(rank);legacy.records=structuredClone(records);legacy.selectedType=definition.type;const events=[];legacy.addRecord=r=>{legacy.records.push(r);events.push('record-added');};legacy.onProgressionPlacement=()=>events.push('progression');legacy.canPlaceZeknovanAid=()=>scenario!=='aid-cooldown';
  const resources=structuredClone(inventory),actual=legacy.place({x:request.x,z:request.z},resources,t),predicted=evaluateZekNovaPlacement(facts);
  const row=report.record({fixtureId:id,request,before:{inventory,records},after:{inventory:resources,records:JSON.parse(JSON.stringify(legacy.records))},actual:actual?JSON.parse(JSON.stringify(actual)):null,predicted,identityControlled:true,rotationControlled:true,events,serializedRecords:JSON.stringify(legacy.records),unobservable:['full-game-pointer-effects','multiplayer']});
  assert.equal(row.matched,true,JSON.stringify(row));
 }
 assert.equal(report.snapshot().total,702);assert.equal(report.snapshot().mismatched,0);
 if(process.env.ZGE_PARITY_REPORT){mkdirSync(new URL('.',new URL('file://'+process.env.ZGE_PARITY_REPORT)).pathname,{recursive:true});writeFileSync(process.env.ZGE_PARITY_REPORT,JSON.stringify(report.snapshot(),null,2));}
});
test('cooperating migration port uses actual legacy placement then engine transaction and rolls back with shared idempotency',async()=>{
 const {AuthorityDomain}=await import('../../core/src/index.js');const {Construction}=await import('../src/index.js');
 let uuid=0;ctx.crypto.randomUUID=()=>`legacy-${++uuid}`;
 const legacy=new ctx.Legacy('ensign'),inventory={minerals:100,iron:100,biomass:100,credits:100};legacy.selectedType='power';legacy.addRecord=r=>legacy.records.push(r);const terrain={isBuildable:()=>true,heightAt:()=>1};let legacyWrites=0,engineWrites=0;
 const engine=new Construction({definitions:CONSTRUCTION_CATALOG,inventory,terrain:{isValid:()=>true,heightAt:()=>1}}),port=new AuthorityDomain({domain:'construction',localFixture:true});
 port.register('LEGACY','actual-legacy-oracle',command=>{legacyWrites++;const record=legacy.place(command,inventory,terrain);return {ok:Boolean(record)};});port.register('ENGINE','independent-construction',command=>{engineWrites++;return engine.execute(command);});
 const first={id:'first',commandId:'first',action:'place',type:'power',x:0,z:0};port.execute(first);assert.equal(inventory.minerals,76);
 port.transition('SHADOW');const migration=engine.snapshot();migration.inventory={...inventory};migration.buildings=JSON.parse(JSON.stringify(legacy.records));engine.restore(migration);port.transition('ENGINE',{certified:true,state:migration,validateMigration:state=>state.version===2&&state.inventory.minerals===76});
 const second={id:'second',commandId:'second',action:'place',type:'power',x:10,z:10};port.execute(second);assert.equal(engine.snapshot().inventory.minerals,52);assert.equal(legacyWrites,1);assert.equal(engineWrites,1);assert.throws(()=>port.writers.get('LEGACY').run(second),/inactive/);
 Object.assign(inventory,engine.snapshot().inventory);legacy.records=engine.snapshot().buildings;port.transition('LEGACY');port.execute(second);assert.equal(inventory.minerals,52,'same command remains idempotent across rollback');assert.equal(legacyWrites,1);
 const journal=port.snapshot(),restored=new AuthorityDomain({domain:'construction'});restored.register('LEGACY','restored',()=>{throw Error('duplicate must not execute');});restored.restore(JSON.parse(JSON.stringify(journal)));assert.equal(restored.execute(second).ok,true);port.dispose();restored.dispose();
});
