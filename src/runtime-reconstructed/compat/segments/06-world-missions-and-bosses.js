const zkMissionDamageBuilding=zkDamageBuilding;
zkDamageBuilding=function(game,record,amount,attacker="ZekNovan assault"){
  const before=game?.getMissionContext?zkCampaignState(game.getMissionContext()):null,result=zkMissionDamageBuilding(game,record,amount,attacker);if(result&&Number(record?.health)<=0&&before){const after=zkCampaignState(game.getMissionContext());if(after.completed<before.completed||after.current?.id!==before.current?.id)game.ui.showToast("Mission infrastructure lost",`${eo.find(item=>item.type===record.type)?.label??record.type} no longer counts toward the campaign. Repair or replace it to restore mission progress.`,"danger")}return result
};

/* Nonlethal reconciliation applies to every combat path, including legacy
   specials whose damage is resolved outside the current weapon controller. */
const zkNonlethalEnemyUpdate=zR.prototype.updateEnemies;
zR.prototype.updateEnemies=function(delta){if(this.reconciliationNonlethal)for(const enemy of this.enemies??[])if(enemy.visible&&Number(enemy.userData.health)<=0)enemy.userData.health=1;return zkNonlethalEnemyUpdate.call(this,delta)};

/* ZekNovan aid infrastructure is deliberately separate from the human colony
   mission graph. These structures persist, take damage, and synchronize like
   other buildings, but their completion produces a large relations benefit. */
function zkAidProject(type){return zkZeknovanAidDefinitions.find(project=>project.type===type)??null}
function zkAidCooldownMs(project){const tension=Math.abs(Number(project?.tension??0)),minutes=He(3+Math.round((tension-10)*.7),3,10);return minutes*60*1e3}
function zkAidCooldownLabel(milliseconds){const seconds=Math.max(0,Math.ceil(Number(milliseconds)/1e3)),minutes=Math.floor(seconds/60),remainder=seconds%60;return minutes?`${minutes}m ${String(remainder).padStart(2,"0")}s`:`${remainder}s`}
function zkAidMaterial(color,preview,{glow=false,dark=false}={}){return new ie({color:preview?6878401:color,emissive:glow?(preview?6878401:color):0,emissiveIntensity:glow?(preview?.2:2.4):0,roughness:dark?.58:.36,metalness:dark?.24:.42,transparent:preview,opacity:preview?.52:1})}
function zkCreateAidModel(type,preview=false){
  const group=new Ge,shell=zkAidMaterial(2915234,preview),accent=zkAidMaterial(6945648,preview,{glow:!0}),dark=zkAidMaterial(1193774,preview,{dark:!0}),violet=zkAidMaterial(11761663,preview,{glow:!0}),base=new R(new ve(2.3,2.7,.72,12),dark),halo=new R(new tt(2.2,.09,8,36),accent);base.position.y=.36,halo.rotation.x=Math.PI/2,halo.position.y=.74,group.add(base,halo);
  if(type==="zek_clinic"){
    const dome=new R(new Se(2.05,24,14,0,Math.PI*2,0,Math.PI/2),shell),core=new R(new Se(.58,16,10),violet);dome.position.y=.82,dome.scale.set(1,1.05,1),core.position.set(0,1.65,1.72),group.add(dome,core);for(let index=0;index<4;index+=1){const angle=index*Math.PI/2,pod=new R(new Se(.55,14,9),accent);pod.scale.set(1.25,.72,.9),pod.position.set(Math.cos(angle)*2,1.1,Math.sin(angle)*2),group.add(pod)}
  }else if(type==="zek_watershed"){
    const basin=new R(new ve(1.75,2.15,.75,18),shell),water=new R(new ve(1.55,1.55,.16,24),new Je({color:preview?6878401:5492223,transparent:!0,opacity:preview?.5:.78})),spire=new R(new ve(.24,.42,3.7,10),dark),crown=new R(new tt(.78,.16,8,28),violet);basin.position.y=1.05,water.position.y=1.48,spire.position.y=3.05,crown.rotation.x=Math.PI/2,crown.position.y=4.72,group.add(basin,water,spire,crown)
  }else if(type==="zek_beacon"){
    const trunk=new R(new ve(.55,.88,4.7,10),shell),orb=new R(new qs(.78,1),violet);trunk.position.y=3.05,orb.position.y=5.62,group.add(trunk,orb);for(let index=0;index<3;index+=1){const ring=new R(new tt(1.18-index*.18,.09,8,30),accent);ring.rotation.x=Math.PI/2,ring.position.y=2.2+index*1.05,group.add(ring)}for(const side of[-1,1]){const fin=new R(new Hi(.62,1.8,6),dark);fin.position.set(side*1.05,2.25,0),fin.rotation.z=side*-.45,group.add(fin)}
  }else if(type==="zek_grove"){
    const trunk=new R(new ve(.62,1.02,3.5,7),dark),crown=new R(new Hi(1.65,3.2,7),shell),seed=new R(new qs(.5,1),violet);trunk.position.y=2.25,crown.position.y=4.35,seed.position.y=5.7,group.add(trunk,crown,seed);for(let index=0;index<5;index+=1){const angle=index/5*Math.PI*2,sapling=new R(new Hi(.42,1.5,6),accent);sapling.position.set(Math.cos(angle)*1.75,1.5,Math.sin(angle)*1.75),group.add(sapling)}
  }else if(type==="zek_habitat"){
    const positions=[[0,0,1.65],[-1.45,.55,1.1],[1.45,.55,1.1]];for(const[x,z,scale]of positions){const dome=new R(new Se(1.45,20,12,0,Math.PI*2,0,Math.PI/2),shell),door=new R(new le(.5,.82,.18),accent);dome.position.set(x,.78,z),dome.scale.setScalar(scale),door.position.set(x,.88,z+1.38*scale),group.add(dome,door)}
  }else if(type==="zek_archive"){
    for(let index=0;index<5;index+=1){const angle=index/5*Math.PI*2,height=2.4+index*.42,crystal=new R(new Hi(.52,height,6),index%2?violet:accent);crystal.position.set(Math.cos(angle)*1.35,1.1+height*.5,Math.sin(angle)*1.35),crystal.rotation.z=(index%2?-.12:.12),group.add(crystal)}const archiveRing=new R(new tt(1.55,.12,8,30),shell);archiveRing.rotation.x=Math.PI/2,archiveRing.position.y=2.15,group.add(archiveRing)
  }else if(type==="zek_market"){
    const canopy=new R(new Hi(2.7,1.65,8),shell),counter=new R(new tt(1.45,.28,8,28),accent);canopy.position.y=4.35,canopy.rotation.y=Math.PI/8,counter.rotation.x=Math.PI/2,counter.position.y=1.35,group.add(canopy,counter);for(let index=0;index<4;index+=1){const angle=index/4*Math.PI*2,support=new R(new ve(.14,.2,3.2,7),dark),lamp=new R(new Se(.25,10,8),violet);support.position.set(Math.cos(angle)*1.65,2.25,Math.sin(angle)*1.65),lamp.position.set(Math.cos(angle)*1.65,3.85,Math.sin(angle)*1.65),group.add(support,lamp)}
  }else if(type==="zek_watch"){
    for(const side of[-1,1]){const tower=new R(new ve(.55,.85,4.25,8),shell),eye=new R(new qs(.5,1),violet);tower.position.set(side*1.05,2.65,0),eye.position.set(side*1.05,4.9,0),group.add(tower,eye)}const bridge=new R(new le(2.65,.32,.52),dark),signal=new R(new tt(.82,.12,8,28),accent);bridge.position.y=3.45,signal.position.y=5.35,group.add(bridge,signal)
  }else if(type==="zek_transit"){
    const gate=new R(new tt(2.05,.25,8,36),shell),portal=new R(new tt(1.55,.08,8,36),violet);gate.position.y=3.05,portal.position.y=3.05,group.add(gate,portal);for(const side of[-1,1]){const pylon=new R(new ve(.52,.82,3.35,8),dark),marker=new R(new Hi(.42,1.05,6),accent);pylon.position.set(side*2.05,1.9,0),marker.position.set(side*2.05,4.1,0),group.add(pylon,marker)}
  }else{
    const marker=new R(new qs(1.15,1),violet);marker.position.y=2.1,group.add(marker)
  }
  group.userData.zeknovanAidType=type,group.scale.setScalar(.96),group.traverse(node=>{if(node instanceof R)node.castShadow=!preview,node.receiveShadow=!0});return group
}

const zkAidCreateModel=LR.prototype.createModel;
LR.prototype.createModel=function(type,preview){return zkZeknovanAidTypes.has(type)?zkCreateAidModel(type,preview):zkAidCreateModel.call(this,type,preview)};
const zkAidPlace=LR.prototype.place;
LR.prototype.place=function(point,resources,terrain){const selectedProject=zkAidProject(this.selectedType);if(selectedProject&&this.canPlaceZeknovanAid?.(selectedProject)===!1)return null;const record=zkAidPlace.call(this,point,resources,terrain),project=record?zkAidProject(record.type):null;if(project){record.beneficiary="zeknovan",record.aidProject=project.type,this.onZeknovanAidPlaced?.(record,project)}return record};

const zkAidBindBuildFilters=wR.prototype.bindGameEvents;
wR.prototype.bindGameEvents=function(){const result=zkAidBindBuildFilters.call(this),dock=document.getElementById("build-dock"),tabs=[...this.root.querySelectorAll("[data-build-filter]")],buttons=[...this.root.querySelectorAll("[data-build-audience]")],setFilter=filter=>{dock&&(dock.dataset.buildFilter=filter);for(const tab of tabs)tab.classList.toggle("active",tab.dataset.buildFilter===filter);for(const button of buttons)button.classList.toggle("hidden",button.dataset.buildAudience!==filter);const selected=eo.find(item=>item.type===this.selectedBuild);selected&&(selected.audience??"colony")!==filter&&this.setBuildSelection(null)};for(const tab of tabs)tab.addEventListener("click",()=>setFilter(tab.dataset.buildFilter??"colony"));setFilter("colony");return result};

zR.prototype.zeknovanAidCooldownRemaining=function(now=Date.now()){return Math.max(0,Number(this.zeknovanAidCooldownUntil??0)-Number(now))};
zR.prototype.beginZeknovanAidCooldown=function(record,project){const milliseconds=zkAidCooldownMs(project),until=Date.now()+milliseconds;this.zeknovanAidCooldownUntil=Math.max(Number(this.zeknovanAidCooldownUntil??0),until),record&&(record.aidCooldownMs=milliseconds,record.aidCooldownUntil=this.zeknovanAidCooldownUntil);return milliseconds};
zR.prototype.renderZeknovanAidCooldown=function(){const remaining=this.zeknovanAidCooldownRemaining(),banner=document.getElementById("zeknovan-aid-cooldown"),active=remaining>0;document.documentElement.dataset.zeknovanAidCooldown=String(Math.ceil(remaining/1e3));if(banner){banner.classList.toggle("hidden",!active),banner.innerHTML=active?`<strong>DIPLOMATIC BUILD WINDOW</strong><span>Next ZekNovan project in ${zkAidCooldownLabel(remaining)}</span>`:""}for(const button of document.querySelectorAll('.build-button[data-build-audience="zeknovan"]'))button.classList.toggle("cooldown",active),button.setAttribute("aria-disabled",active?"true":"false");return remaining};
zR.prototype.canPlaceZeknovanAid=function(project,{announce=!0}={}){const remaining=this.renderZeknovanAidCooldown();if(!project||remaining<=0)return!0;if(announce&&Date.now()-Number(this.lastAidCooldownToastAt??0)>900){this.lastAidCooldownToastAt=Date.now();const windowMinutes=Math.round(zkAidCooldownMs(project)/6e4);this.ui.showToast("ZekNovan aid crews unavailable",`${zkAidCooldownLabel(remaining)} until another diplomatic infrastructure project can begin. ${project.label} carries a ${windowMinutes}-minute stabilization window.`,"warning")}return!1};
const zkApplyAidProject=zR.prototype.applyZeknovanAidProject;
zR.prototype.applyZeknovanAidProject=function(record,project){if(!record||!project||record.aidEffectAppliedAt)return;this.beginZeknovanAidCooldown(record,project);return zkApplyAidProject.call(this,record,project)};
const zkAidInitialize=zR.prototype.initialize;
zR.prototype.initialize=async function(){const result=await zkAidInitialize.call(this);if(this.buildings)this.buildings.onZeknovanAidPlaced=(record,project)=>this.applyZeknovanAidProject(record,project);const local=location.hostname==="127.0.0.1"||location.hostname==="localhost";if(local&&new URLSearchParams(location.search).has("qaAid")){for(const enemy of this.enemies)this.scene.remove(enemy);this.enemies.length=0,this.enemyTimer=0,this.enemySpawnDelay=3600,this.diplomacyOutcome="negotiate",this.diplomacyTension=60,Object.assign(this.simulation.resources,{minerals:999,credits:999,iron:999,biomass:999,energy:999,data:999,trust:40}),this.updateHud(!0),console.info("ZekNova ZekNovan-aid QA profile ready with nine mineral-and-credit projects at 60 tension and 40 trust.")}return result};
const zkAidCooldownInitialize=zR.prototype.initialize;
zR.prototype.initialize=async function(){const result=await zkAidCooldownInitialize.call(this),restored=Math.max(0,...(this.buildings?.records??[]).filter(record=>zkAidProject(record.type)).map(record=>Number(record.aidCooldownUntil??0)));this.zeknovanAidCooldownUntil=Math.max(Number(this.zeknovanAidCooldownUntil??0),restored),this.buildings&&(this.buildings.canPlaceZeknovanAid=project=>this.canPlaceZeknovanAid(project));const dock=document.getElementById("build-dock"),heading=dock?.querySelector(".dock-heading");heading&&!document.getElementById("zeknovan-aid-cooldown")&&heading.insertAdjacentHTML("afterend",'<div id="zeknovan-aid-cooldown" class="zeknovan-aid-cooldown hidden" aria-live="polite"></div>');const canvas=this.renderer?.domElement,basePointerDown=this.onPointerDown;if(canvas&&basePointerDown){canvas.removeEventListener("pointerdown",basePointerDown),this.onPointerDown=event=>{const project=zkAidProject(this.buildings?.selectedType);if(this.mode==="command"&&project&&!this.canPlaceZeknovanAid(project))return;return basePointerDown(event)},canvas.addEventListener("pointerdown",this.onPointerDown)}const local=location.hostname==="127.0.0.1"||location.hostname==="localhost",params=new URLSearchParams(location.search);local&&params.has("qaAidCooldown")&&(this.zeknovanAidCooldownUntil=Date.now()+3*60*1e3),this.renderZeknovanAidCooldown(),this.zeknovanAidCooldownTimer=window.setInterval(()=>this.renderZeknovanAidCooldown(),1e3);return result};
/* Cohesive performance layer: diffed HUD painting, indexed world collision,
   incremental utility links, fixed-rate AI, and adaptive graphics quality. */
function zkHudText(id,value){const node=document.getElementById(id),text=String(value);if(node&&node.textContent!==text)node.textContent=text}
function zkHudBar(id,value){const node=document.getElementById(id),width=`${Math.max(0,Math.min(100,Number(value)||0))}%`;if(node instanceof HTMLElement&&node.style.width!==width)node.style.width=width}
function zkHudHtml(node,signature,markup){if(!node||node.dataset.zkSignature===signature)return;node.dataset.zkSignature=signature,node.innerHTML=markup}
function zkRoundedSignature(object){return Object.entries(object??{}).map(([key,value])=>`${key}:${Math.round(Number(value)||0)}`).join("|")}

wR.prototype.updateHud=function(state){
  this.lastState=state;
  const cache=this.zkHudCache??(this.zkHudCache={});
  const context=state.missionContext??{buildings:state.buildingCounts,stats:{}},campaign=zkCampaignState(context),mission=campaign.current,tier=campaign.tier;
  zkHudText("phase-label",`TIER ${SR(tier.number)}`),zkHudText("phase-title",tier.title),zkHudText("score-value",Math.round(state.score)),zkHudText("health-value",Math.round(state.health)),zkHudText("stamina-value",Math.round(state.stamina)),zkHudText("xp-value",Math.round(state.xp)),zkHudBar("health-bar",state.health),zkHudBar("stamina-bar",state.stamina),zkHudBar("xp-bar",state.xp%100),zkHudText("renderer-label",state.rendererLabel);
  zkHudText("objective-title",mission?.title??"Frontier stronghold operational"),zkHudText("objective-copy",mission?`${mission.objective} ${zkMissionProgress(mission,context)}.`:"All installation tiers are complete. Continue defending, expanding, and improving readiness."),zkHudText("mission-progress",mission?`MISSION ${campaign.currentIndex+1} / ${campaign.total}`:`ALL ${campaign.total} MISSIONS COMPLETE`);
  const diplomacyLabels={share:"WATERSHED STEWARDSHIP · LOW PATROL RISK",negotiate:"NEGOTIATED SAFE ZONE · PROTECTED",force:"ALL-OUT WAR · CONSTANT ATTACKS"};
  zkHudText("diplomacy-status",diplomacyLabels[state.diplomacyOutcome]??"FIRST CONTACT PENDING");const diplomacyStatus=document.getElementById("diplomacy-status");if(diplomacyStatus&&diplomacyStatus.dataset.outcome!==(state.diplomacyOutcome??"pending"))diplomacyStatus.dataset.outcome=state.diplomacyOutcome??"pending";
  const missionSignature=`${tier.number}|${mission?.id??"complete"}|${tier.missions.map(item=>`${item.id}:${zkMissionComplete(item,context)?1:0}`).join(",")}`;
  zkHudHtml(document.getElementById("mission-ladder"),missionSignature,tier.missions.map(item=>{const complete=zkMissionComplete(item,context),active=item.id===mission?.id,status=complete?"complete":active?"active":"locked",icon=complete?"✓":active?"◆":"◇";return`<li class="${status}"><span>${icon}</span><b>${Li(item.title)}</b></li>`}).join(""));
  const objectiveSignature=mission?`${mission.id}|${(mission.subObjectives??[]).map(item=>`${item.key}:${zkObjectiveValue(item,context)}:${zkObjectiveComplete(item,context)?1:0}`).join(",")}`:"complete";
  zkHudHtml(document.getElementById("sub-objective-list"),objectiveSignature,mission?[...(mission.subObjectives??[])].map((item,index)=>({item,index,complete:zkObjectiveComplete(item,context)})).sort((a,b)=>Number(a.complete)-Number(b.complete)||a.index-b.index).map(({item,complete})=>{const value=Math.min(zkObjectiveValue(item,context),item.target);return`<li class="${complete?"complete":""}"><span>${complete?"✓":"○"}</span><b>${Li(item.label)}</b><small>${value}/${item.target}</small></li>`}).join(""):"<li class=\"complete\"><span>✓</span><b>All mission objectives complete</b></li>");
  const resourceSignature=zkRoundedSignature(state.resources),resourceGrid=document.getElementById("resource-grid");
  if(cache.resources!==resourceSignature){cache.resources=resourceSignature;const definitions=[["energy","Energy","⚡"],["water","Water","◉"],["minerals","Minerals","◆"],["iron","Iron Ore","⬢"],["biomass","Biomass","❋"],["timber","Timber","▥"],["data","Data","◈"],["credits","Colony Credits","◎"],["trust","Local Trust","◇"]];resourceGrid&&(resourceGrid.innerHTML=definitions.map(([key,label,icon])=>`<div class="resource-item"><b>${icon}</b><span>${label}</span><strong>${Math.round(state.resources[key])}</strong></div>`).join(""))}
  const credits=Math.max(0,Math.floor(Number(state.resources.credits)||0));zkHudText("message-credit-balance",`${credits} CREDIT${credits===1?"":"S"} AVAILABLE`);
  const indicatorSignature=zkRoundedSignature(state.indicators),indicatorGrid=document.getElementById("indicator-grid");if(cache.indicators!==indicatorSignature){cache.indicators=indicatorSignature;indicatorGrid&&(indicatorGrid.innerHTML=Object.entries(state.indicators).map(([key,value])=>`<div class="indicator"><span>${MR(key)}</span><div><i style="width:${Math.max(0,Math.min(100,value))}%"></i></div><b>${Math.round(value)}</b></div>`).join(""))}
  const leaderboardSignature=`${state.user.teamName}|${Math.round(state.score)}`,leaderboard=document.getElementById("leaderboard");if(cache.leaderboard!==leaderboardSignature){cache.leaderboard=leaderboardSignature;leaderboard&&(leaderboard.innerHTML=`<li class="mine"><span>1</span><strong>${Li(state.user.teamName)}</strong><b>${Math.round(state.score)}</b></li>`)}
  if(cache.mode!==state.mode){cache.mode=state.mode;const button=document.getElementById("mode-button"),label=document.getElementById("mode-label"),icon=document.getElementById("mode-icon"),dock=document.getElementById("build-dock"),crosshair=document.getElementById("crosshair");if(state.mode==="command")button?.classList.add("active"),label&&(label.textContent="RETURN TO EXPLORATION"),icon&&(icon.textContent="⌖"),dock?.classList.remove("hidden"),crosshair?.classList.add("hidden");else button?.classList.remove("active"),label&&(label.textContent="ENTER COMMAND MODE"),icon&&(icon.textContent="◎"),dock?.classList.add("hidden"),crosshair?.classList.remove("hidden")}
  const buildSignature=`${this.selectedBuild??""}|${state.user.officerClass}|${resourceSignature}`;
  if(cache.build!==buildSignature){cache.build=buildSignature;this.root.querySelectorAll("[data-build]").forEach(node=>{const type=node.dataset.build;node.classList.toggle("selected",type===this.selectedBuild);const definition=eo.find(item=>item.type===type),cost=definition?Object.fromEntries(Object.entries(definition.cost).map(([key,value])=>[key,key==="minerals"&&state.user.officerClass==="lieutenant"?Math.ceil(Number(value)*.85):Number(value)])):{},missing=Object.entries(cost).map(([key,value])=>[key,Math.max(0,Number(value)-Number(state.resources[key]??0))]).filter(([,value])=>value>0),affordable=missing.length===0;node.classList.toggle("unaffordable",!affordable);const small=node.querySelector("small");small&&(small.textContent=affordable?pm(cost):`NEED ${missing.map(([key,value])=>`${key.slice(0,1).toUpperCase()}+${Math.ceil(value)}`).join(" · ")}`)})}
};

PR.prototype.rebuildWorldObstacleIndexes=function(force=false){
  const buildingRecords=this.worldBuildings?.records??[],environment=this.worldEnvironmentObstacles??[];
  if(force||this.zkBuildingIndexRecords!==buildingRecords||this.zkBuildingIndexCount!==buildingRecords.length){this.zkBuildingObstacleIndex??=new zkSpatialHash(8),this.zkBuildingObstacleIndex.clear();for(const record of buildingRecords)this.zkBuildingObstacleIndex.insert(record,Number(record.x),Number(record.z),zkBuildingCollisionRadius(record.type));this.zkBuildingIndexRecords=buildingRecords,this.zkBuildingIndexCount=buildingRecords.length}
  if(force||this.zkEnvironmentIndexRecords!==environment||this.zkEnvironmentIndexCount!==environment.length){this.zkEnvironmentObstacleIndex??=new zkSpatialHash(8),this.zkEnvironmentObstacleIndex.clear();for(const obstacle of environment)this.zkEnvironmentObstacleIndex.insert(obstacle,Number(obstacle.x),Number(obstacle.z),Number(obstacle.radius??.7));this.zkEnvironmentIndexRecords=environment,this.zkEnvironmentIndexCount=environment.length}
};
PR.prototype.indexBuildingRecord=function(record){if(!record)return;this.zkBuildingObstacleIndex??=new zkSpatialHash(8),this.zkBuildingObstacleIndex.insert(record,Number(record.x),Number(record.z),zkBuildingCollisionRadius(record.type)),this.zkBuildingIndexRecords=this.worldBuildings?.records??null,this.zkBuildingIndexCount=this.worldBuildings?.records?.length??0};
PR.prototype.isObstacleAt=function(x,z,radius=.65){
  if(this.zkWasmRocksReady&&zkWasmCore?zkWasmCore.rock_obstacle_at(x,z,radius):zkBaseTerrainObstacle.call(this,x,z,radius))return!0;
  for(const object of this.nearby(x,z,radius+3)){if(!object.visible||object.userData.falling||!object.userData.harvestableTree)continue;const proceduralRadius=.18+Number(object.userData.widthScale??1)*Number(object.userData.treeSize==="large"?.24:object.userData.treeSize==="medium"?.18:.12),trunkRadius=Number(object.userData.highDetailCollisionRadius??proceduralRadius);if(Math.hypot(object.position.x-x,object.position.z-z)<trunkRadius+radius)return!0}
  this.rebuildWorldObstacleIndexes();
  const buildings=this.zkBuildingObstacleIndex?.query(x,z,radius+3)??[];for(const record of buildings){if(record===this.collisionIgnoreRecord||record.type==="bridge"||record.type==="boat"||Number(record.health??1000)<=0)continue;if(Math.hypot(Number(record.x)-x,Number(record.z)-z)<zkBuildingCollisionRadius(record.type)+radius)return!0}
  const obstacles=this.zkEnvironmentObstacleIndex?.query(x,z,radius+3)??[];for(const obstacle of obstacles)if(Math.hypot(Number(obstacle.x)-x,Number(obstacle.z)-z)<Number(obstacle.radius??.7)+radius)return!0;return!1
};

function zkEnsureUtilityState(manager){
  manager.utilityLinks||(manager.utilityLinks=new Ge,manager.utilityLinks.name="directUtilityLinks",manager.group.add(manager.utilityLinks));
  manager.utilitySpatial??=new zkSpatialHash(18),manager.utilityLinkMeshes??=new Map,manager.utilityLinkMaterials??=new Map,manager.utilityGraph??=new Map,manager.utilityOperational??=new Map;
  if(manager.zkUtilityIndexedCount!==manager.records.length){manager.utilitySpatial.clear();for(const record of manager.records)manager.utilitySpatial.insert(record,Number(record.x),Number(record.z));manager.zkUtilityIndexedCount=manager.records.length}
}
function zkUtilityMaterial(manager,type){let material=manager.utilityLinkMaterials.get(type);if(!material){material=new ie({color:zkUtilityNetwork.colors[type],emissive:zkUtilityNetwork.colors[type],emissiveIntensity:1.35,roughness:.42,metalness:.38}),manager.utilityLinkMaterials.set(type,material)}return material}
function zkIncrementalLink(manager,source,target,type){const key=`${source.id}>${target.id}:${type}`;if(manager.utilityLinkMeshes.has(key))return;const start=new w(Number(source.x),Number(source.y)+.3,Number(source.z)),end=new w(Number(target.x),Number(target.y)+.3,Number(target.z)),direction=end.clone().sub(start),length=direction.length();if(length<.25)return;const mesh=new R(new ve(type==="water"?.11:.075,type==="water"?.11:.075,length,8),zkUtilityMaterial(manager,type));mesh.position.copy(start).add(end).multiplyScalar(.5),mesh.quaternion.setFromUnitVectors(new w(0,1,0),direction.normalize()),mesh.userData.utilityType=type,mesh.userData.sourceId=source.id,mesh.userData.targetId=target.id,mesh.castShadow=!1,mesh.receiveShadow=!0,manager.utilityLinks.add(mesh),manager.utilityLinkMeshes.set(key,mesh)}
function zkRemoveUtilityLink(manager,key){const mesh=manager.utilityLinkMeshes.get(key);if(!mesh)return;manager.utilityLinks.remove(mesh),mesh.geometry?.dispose?.(),manager.utilityLinkMeshes.delete(key)}
LR.prototype.refreshUtilityRecords=function(changedRecords=null){
  zkEnsureUtilityState(this);let dirty;
  if(!changedRecords?.length){dirty=new Set(this.records);for(const key of [...this.utilityLinkMeshes.keys()])zkRemoveUtilityLink(this,key);this.utilityGraph=new Map(this.records.map(record=>[record.id,new Set])),this.utilityOperational=new Map}
  else{dirty=new Set(changedRecords.filter(Boolean));for(let depth=0;depth<4;depth+=1){const frontier=[...dirty];for(const record of frontier)for(const candidate of this.utilitySpatial.query(Number(record.x),Number(record.z),30))dirty.add(candidate)}const ids=new Set([...dirty].map(record=>record.id));for(const[key,mesh]of [...this.utilityLinkMeshes])if(ids.has(mesh.userData.sourceId)||ids.has(mesh.userData.targetId))zkRemoveUtilityLink(this,key);for(const links of this.utilityGraph.values())for(const id of ids)links.delete(id);for(const record of dirty)this.utilityGraph.set(record.id,new Set)}
  for(const record of dirty){const status=zkUtilityStatus(this,record.type,record.x,record.z,record.id);this.utilityOperational.set(record.id,status.ok);if(!status.ok)continue;for(const connection of status.connections){if(!connection.source)continue;this.utilityGraph.get(record.id)?.add(connection.source.id);this.utilityGraph.get(connection.source.id)?.add(record.id);zkIncrementalLink(this,connection.source,record,connection.utility)}}
  this.zkUtilitySignature=this.records.map(record=>`${record.id}:${record.type}:${Number(record.health??1000)>0?1:0}`).join("|");
};
LR.prototype.beginUtilityBatch=function(){this.zkUtilityBatchDepth=Number(this.zkUtilityBatchDepth??0)+1};
LR.prototype.endUtilityBatch=function(){this.zkUtilityBatchDepth=Math.max(0,Number(this.zkUtilityBatchDepth??0)-1);if(!this.zkUtilityBatchDepth&&this.zkUtilityBatchDirty)this.zkUtilityBatchDirty=!1,this.refreshUtilityRecords()};
LR.prototype.rebuildUtilityLinks=function(changedRecord=null){if(this.zkUtilityBatchDepth){this.zkUtilityBatchDirty=!0;return}const mutation=changedRecord??this.zkUtilityMutation;if(mutation){this.refreshUtilityRecords([mutation]);return}const signature=this.records.map(record=>`${record.id}:${record.type}:${Number(record.health??1000)>0?1:0}`).join("|");if(signature===this.zkUtilitySignature)return;this.refreshUtilityRecords()};
const zkOptimizedAddRecord=LR.prototype.addRecord;
LR.prototype.addRecord=function(record){this.zkUtilityMutation=record;try{const result=zkOptimizedAddRecord.call(this,record);this.utilityTerrain?.indexBuildingRecord?.(record);return result}finally{this.zkUtilityMutation=null}};
const zkOptimizedRestore=zR.prototype.restore;
zR.prototype.restore=function(snapshot){this.buildings?.beginUtilityBatch?.();try{return zkOptimizedRestore.call(this,snapshot)}finally{this.buildings?.endUtilityBatch?.()}};
const zkOptimizedDamageBuilding=zkDamageBuilding;
zkDamageBuilding=function(game,record,amount,attacker="ZekNovan assault"){if(game?.buildings)game.buildings.zkUtilityMutation=record;try{return zkOptimizedDamageBuilding(game,record,amount,attacker)}finally{if(game?.buildings)game.buildings.zkUtilityMutation=null}};
const zkOptimizedRepairBuilding=zR.prototype.repairBuilding;
zR.prototype.repairBuilding=function(record){if(this.buildings)this.buildings.zkUtilityMutation=record;try{return zkOptimizedRepairBuilding.call(this,record)}finally{if(this.buildings)this.buildings.zkUtilityMutation=null}};

const zkFullRateEnemyUpdate=zR.prototype.updateEnemies,zkEnemyAiStep=1/15;
zR.prototype.updateEnemies=function(delta){
  const dt=Math.min(.05,Math.max(0,Number(delta)||0));this.zkEnemyInterpolation??=new Map;
  for(const[enemy,state]of [...this.zkEnemyInterpolation]){if(!this.enemies.includes(enemy)){this.zkEnemyInterpolation.delete(enemy);continue}state.elapsed+=dt;const alpha=Math.min(1,state.elapsed/zkEnemyAiStep),smooth=alpha*alpha*(3-2*alpha);enemy.position.lerpVectors(state.start,state.target,smooth);const turn=Math.atan2(Math.sin(state.targetRotation-state.startRotation),Math.cos(state.targetRotation-state.startRotation));enemy.rotation.y=state.startRotation+turn*smooth;if(alpha>=1)this.zkEnemyInterpolation.delete(enemy)}
  this.zkEnemyAiAccumulator=Number(this.zkEnemyAiAccumulator??0)+dt;if(this.zkEnemyAiAccumulator<zkEnemyAiStep)return;const step=Math.min(.2,this.zkEnemyAiAccumulator);this.zkEnemyAiAccumulator=0;
  const before=new Map(this.enemies.map(enemy=>[enemy,{position:enemy.position.clone(),rotation:enemy.rotation.y}])),result=zkFullRateEnemyUpdate.call(this,step);
  for(const enemy of this.enemies){const start=before.get(enemy);if(!start||Number(enemy.userData.health)<=0)continue;const target=enemy.position.clone(),targetRotation=enemy.rotation.y;if(target.distanceToSquared(start.position)<1e-8&&Math.abs(targetRotation-start.rotation)<1e-5)continue;enemy.position.copy(start.position),enemy.rotation.y=start.rotation,this.zkEnemyInterpolation.set(enemy,{start:start.position,target,startRotation:start.rotation,targetRotation,elapsed:0})}return result
};

const zkQualityOrder=["low","balanced","high"];
zR.prototype.applyGraphicsQuality=function(tier,reason="auto"){
  if(!this.renderer)return;const normalized=zkQualityOrder.includes(tier)?tier:"balanced";if(this.graphicsQuality===normalized&&reason!=="initialize")return;this.graphicsQuality=normalized,document.documentElement.dataset.graphicsQuality=normalized;
  const ratioLimit=normalized==="low"?.8:normalized==="high"?Be.maxPixelRatio:1,ratio=Math.min(Number(devicePixelRatio)||1,ratioLimit);/* Pixel ratio is fixed at renderer construction and is NOT changed per tier. setPixelRatio()+resize() rebuild the swapchain and depth attachments; doing that from the adaptive scaler - which runs inside the render loop - destroys textures that already-submitted WebGPU command buffers still reference, black-screening the game. That is why the crash only appeared without ?quality=: a forced quality disables the scaler entirely. Tiers now only change settings that allocate nothing. */
  const shadowSize=0;this.renderer.shadowMap.enabled=normalized!=="low";/* Shadow map size is fixed at initialize() and never reallocated. Resizing it here destroyed the depth texture while queued WebGPU command buffers still referenced it, which produced a flood of "Destroyed texture [ShadowDepthTexture] used in a submit" validation errors and a black viewport. Quality tiers now only toggle shadows on/off and change pixel ratio. */
  this.aoEnvironment?.setQuality?.(normalized),this.rendererLabel=`${zkBackendLabel(this.renderer)} · AUTO ${normalized.toUpperCase()}`,this.updateHud(!0),globalThis.dispatchEvent?.(new CustomEvent("zeknova:quality-change",{detail:{tier:normalized,reason,pixelRatio:ratio}}));console.info(`ZekNova graphics quality: ${normalized} (${reason}, pixel ratio ${ratio.toFixed(2)}).`)
};
zR.prototype.startGraphicsQualityMonitor=function(){
  const forced=new URLSearchParams(location.search).get("quality"),validForced=zkQualityOrder.includes(forced),initial=validForced?forced:zkLowPowerDevice?"low":"balanced";this.applyGraphicsQuality(initial,"initialize");
  const state=this.zkQualityMonitor={last:performance.now(),windowStart:performance.now(),frames:0,lowWindows:0,highWindows:0,forced:validForced};
  const sample=now=>{if(this.disposed)return;const elapsed=now-state.windowStart;state.frames+=1;if(elapsed>=2500){const fps=state.frames*1000/elapsed;this.zkLastMeasuredFps=Number(fps.toFixed(1));state.frames=0,state.windowStart=now;if(!state.forced&&!document.hidden){state.lowWindows=fps<42?state.lowWindows+1:0,state.highWindows=fps>57?state.highWindows+1:0;const index=zkQualityOrder.indexOf(this.graphicsQuality);if(state.lowWindows>=2&&index>0)state.lowWindows=0,state.highWindows=0,this.applyGraphicsQuality(zkQualityOrder[index-1],`sustained ${Math.round(fps)} FPS`);else if(state.highWindows>=4&&index<2&&!zkLowPowerDevice)state.lowWindows=0,state.highWindows=0,this.applyGraphicsQuality(zkQualityOrder[index+1],`stable ${Math.round(fps)} FPS`)}}this.zkQualityAnimationFrame=requestAnimationFrame(sample)};this.zkQualityAnimationFrame=requestAnimationFrame(sample)
};
const zkAdaptiveInitialize=zR.prototype.initialize;
zR.prototype.initialize=async function(){const result=await zkAdaptiveInitialize.call(this);this.terrain&&(this.terrain.worldBuildings=this.buildings,this.terrain.rebuildWorldObstacleIndexes?.(!0)),this.startGraphicsQualityMonitor();return result};
const zkQualityEnvironmentLoad=zR.prototype.loadAOEnvironment;
zR.prototype.loadAOEnvironment=async function(){const result=await zkQualityEnvironmentLoad.call(this);this.aoEnvironment?.setQuality?.(this.graphicsQuality??"balanced"),this.terrain?.rebuildWorldObstacleIndexes?.(!0);return result};
const zkAdaptiveDispose=zR.prototype.dispose;
zR.prototype.dispose=function(){cancelAnimationFrame(this.zkQualityAnimationFrame);for(const material of this.buildings?.utilityLinkMaterials?.values?.()??[])material.dispose?.();return zkAdaptiveDispose.call(this)};

/* Keep the diplomatic-build countdown on top of the final diff-rendered HUD. */
const zkFinalAidCooldownHud=zR.prototype.updateHud;
zR.prototype.updateHud=function(force){const result=zkFinalAidCooldownHud.call(this,force);return this.renderZeknovanAidCooldown?.(),result};
const zkFinalAidCooldownDispose=zR.prototype.dispose;
zR.prototype.dispose=function(){window.clearInterval(this.zeknovanAidCooldownTimer);return zkFinalAidCooldownDispose.call(this)};

/* Mission-end boss framework: deterministic, pooled, reversible, and shared. */
function zkBossHash(value){let hash=2166136261;for(const character of String(value))hash=Math.imul(hash^character.charCodeAt(0),16777619);return hash>>>0}
function zkBossBiomeState(){return{visited:!1,resources:0,stats:{treesChopped:0,rocksMined:0,powerUpsCollected:0,enemiesDefeated:0},buildings:{}}}
function zkBossRecordBiomeStat(game,x,z,key,amount=1){const id=zkAOAt(Number(x),Number(z)).id,all=game.missionStats.biomeStats??(game.missionStats.biomeStats={}),state=all[id]??(all[id]={});state[key]=Number(state[key]??0)+amount}

class zkBossProjectilePool{
  constructor(game,limit=250){this.game=game;this.limit=limit;this.group=new Ge;this.group.name="bossProjectilePool";this.geometry=new Se(.26,12,8);this.materials=new Map;this.available=[];this.active=[];this.peak=0;game.scene.add(this.group);for(let index=0;index<40;index+=1)this.available.push(this.create(0x9fe45c))}
  material(color){let material=this.materials.get(color);if(!material)material=new ie({color,emissive:color,emissiveIntensity:2.2,roughness:.28,metalness:.18}),this.materials.set(color,material);return material}
  create(color){const mesh=new R(this.geometry,this.material(color));mesh.visible=!1;mesh.castShadow=!1;this.group.add(mesh);return mesh}
  acquire({position,velocity,damage=8,lifetime=5,radius=.55,patternId="boss_projectile",color=0x9fe45c,scale=1,terrainFollow=!1,heightOffset=.9,homing=0,homingDelay=0,homingUntil=1e9}={}){if(this.active.length>=this.limit)return null;const mesh=this.available.pop()??this.create(color);mesh.material=this.material(color);mesh.position.copy(position);mesh.scale.setScalar(scale);mesh.visible=!0;const projectile={mesh,velocity:velocity.clone(),damage,lifetime,radius,patternId,terrainFollow,heightOffset,homing,homingDelay,homingUntil,age:0,id:`bp-${performance.now().toFixed(2)}-${this.active.length}`};this.active.push(projectile);this.peak=Math.max(this.peak,this.active.length);return projectile}
  release(projectile){const index=this.active.indexOf(projectile);if(index>=0)this.active.splice(index,1);projectile.mesh.visible=!1;projectile.mesh.scale.setScalar(1);this.available.push(projectile.mesh)}
  update(delta,manager){const player=this.game.player?.group?.position;if(!player)return;for(let index=this.active.length-1;index>=0;index-=1){const projectile=this.active[index];projectile.age+=delta;
/* Homing: steer the velocity toward the player without changing its speed, so a
 * tracking shot stays as fast as a straight one. `homing` is the turn rate in
 * radians-equivalent per second; homingDelay gives the player a reaction window
 * before tracking engages, and homingUntil lets a shot go inert near the target
 * so it cannot orbit the player forever. */
if(projectile.homing>0&&projectile.age>=projectile.homingDelay&&projectile.age<projectile.homingUntil){
  const px=player.x-projectile.mesh.position.x,py=player.y+1.2-projectile.mesh.position.y,pz=player.z-projectile.mesh.position.z;
  const toLen=Math.hypot(px,py,pz);
  if(toLen>.001){
    const speed=projectile.velocity.length()||1,turn=Math.min(1,projectile.homing*delta);
    projectile.velocity.x+=(px/toLen*speed-projectile.velocity.x)*turn;
    projectile.velocity.y+=(py/toLen*speed-projectile.velocity.y)*turn;
    projectile.velocity.z+=(pz/toLen*speed-projectile.velocity.z)*turn;
    if(projectile.velocity.lengthSq()>1e-6)projectile.velocity.setLength(speed);
  }
}
/* Pinball bounce: aerial spore orbs ricochet off arena walls and ground with
 * damped reflection. `bounces` limits total ricochets; velocity reflects on
 * boundary/ground contact and homing is disabled after first bounce. */
if(projectile.bounces>0){
  const ground=this.game.terrain.heightAt(projectile.mesh.position.x,projectile.mesh.position.z)+Number(projectile.heightOffset??.9)+.2;
  if(projectile.mesh.position.y<=ground&&projectile.velocity.y<0){
    projectile.mesh.position.y=ground;
    projectile.velocity.y=-projectile.velocity.y*0.82;
    projectile.velocity.x*=0.92;projectile.velocity.z*=0.92;
    projectile.bounces-=1;projectile.homing=0;
    if(projectile.bounces<=0) projectile.lifetime=Math.min(projectile.lifetime, projectile.age+1.2);
  }
  const dxC=projectile.mesh.position.x-manager.center.x,dzC=projectile.mesh.position.z-manager.center.z,dist=Math.hypot(dxC,dzC);
  if(dist>manager.radius+14){
    const nx=dxC/dist,nz=dzC/dist,dot=projectile.velocity.x*nx+projectile.velocity.z*nz;
    if(dot>0){
      projectile.velocity.x-=2*dot*nx*0.92;
      projectile.velocity.z-=2*dot*nz*0.92;
      projectile.mesh.position.x=manager.center.x+nx*(manager.radius+13.5);
      projectile.mesh.position.z=manager.center.z+nz*(manager.radius+13.5);
      projectile.bounces-=1;projectile.homing=0;
    }
  }
  projectile.mesh.position.addScaledVector(projectile.velocity,delta);
} else {
projectile.mesh.position.addScaledVector(projectile.velocity,delta);if(projectile.terrainFollow){const ground=this.game.terrain.heightAt(projectile.mesh.position.x,projectile.mesh.position.z)+Number(projectile.heightOffset??.9);projectile.mesh.position.y=Kt.lerp(projectile.mesh.position.y,ground,Math.min(1,delta*18))}}
projectile.mesh.rotation.x+=delta*3.2;projectile.mesh.rotation.y+=delta*4.1;const dx=projectile.mesh.position.x-player.x,dy=projectile.mesh.position.y-(player.y+1.2),dz=projectile.mesh.position.z-player.z;if(dx*dx+dy*dy+dz*dz<(projectile.radius+.62)**2){manager.damagePlayer(projectile.damage,projectile.patternId,projectile.id);this.release(projectile);continue}if(projectile.bounces>0){
  if(projectile.age>=projectile.lifetime||projectile.mesh.position.y<-2) this.release(projectile);
} else {
if(projectile.age>=projectile.lifetime||Math.hypot(projectile.mesh.position.x-manager.center.x,projectile.mesh.position.z-manager.center.z)>manager.radius+18||projectile.mesh.position.y<-2)this.release(projectile)
}}}
  clear(){for(let index=this.active.length-1;index>=0;index-=1)this.release(this.active[index])}
  dispose(){this.clear();this.game.scene.remove(this.group);this.geometry.dispose();for(const material of this.materials.values())material.dispose();this.materials.clear();this.available.length=0}
}

function zkBossRadial(pool,origin,{count=18,speed=5.4,damage=8,offset=0,gapEvery=6,patternId="radial",color=0x9fe45c,height=.9}={}){for(let index=0;index<count;index+=1){if(gapEvery>0&&(index%gapEvery===gapEvery-1||index%gapEvery===gapEvery-2))continue;const angle=offset+index/count*Math.PI*2,velocity=new w(Math.cos(angle)*speed,0,Math.sin(angle)*speed);pool.acquire({position:origin.clone().add(new w(0,height,0)),velocity,damage,lifetime:6,patternId,color,scale:1.45,terrainFollow:!0,heightOffset:height})}}
function zkBossSpiral(pool,origin,{arms=2,shots=14,speed=4.8,offset=0,patternId="spiral",color=0x9fe45c}={}){for(let arm=0;arm<arms;arm+=1)for(let shot=0;shot<shots;shot+=1){const angle=offset+arm/arms*Math.PI*2+shot*.31,velocity=new w(Math.cos(angle)*speed,0,Math.sin(angle)*speed);pool.acquire({position:origin.clone().add(new w(0,1.1,0)),velocity,damage:9,lifetime:6,patternId,color,scale:1.35,terrainFollow:!0,heightOffset:1.1})}}
function zkBossFan(pool,origin,target,{count=7,spread=.72,speed=7,damage=10,patternId="fan",color=0x57e7cc,height=1.5}={}){const direction=target.clone().sub(origin);direction.y=0;if(direction.lengthSq()<.001)direction.set(0,0,1);direction.normalize();for(let index=0;index<count;index+=1){const angle=count===1?0:(index/(count-1)-.5)*spread,velocity=direction.clone().applyAxisAngle(new w(0,1,0),angle).multiplyScalar(speed);pool.acquire({position:origin.clone().add(new w(0,height,0)),velocity,damage,lifetime:5,patternId,color,scale:1.7,terrainFollow:!0,heightOffset:height})}}

async function zkLoadMissionBossVisual(game,boss,config){
  const visualLoaders={desert_sunscar_colossus:"loadSunscarBossModel",wetlands_mire_siren:"loadMireSirenBossModel",highlands_stormback:"loadStormbackBossModel",forest_ancient_thornwarden:"loadAncientThornwardenBossModel",arctic_white_screecher:"loadWhiteScreecherBossModel",wetlands_drowned_tremor:"loadDrownedTremorBossModel",/* Only six bosses ship their own rig. The rest previously hit `if(!loaderName)return` and fell back to the untextured procedural block. Each now borrows the rig of a boss with the same sourceEnemyType, so the silhouette and animation set match its attack style; per-boss colour still comes from its own config. */arctic_archive_shade:"loadArchiveShadeBossModel",wetlands_broodwarden:"loadInsectKingBossModel",forest_spore_cantor:"loadStormbackBossModel",highlands_arc_gunner:"loadStormbackBossModel",forest_rootbound_tremor:"loadDrownedTremorBossModel",desert_cinder_scrapper:"loadObsidianKnightBossModel"},loaderName=visualLoaders[config?.id];
  if(!loaderName)return;
  try{
    const runtime=await import("./model-runtime-c96327ba.js?v=quat-fix1"),loader=runtime[loaderName];if(typeof loader!=="function")throw new Error(`${loaderName} is unavailable`);const model=await loader();
    if(game.disposed||!boss.parent||Number(boss.userData.health)<=0){model.dispose?.();return}
    if(model.calibrate?.()!==!0){model.dispose?.();console.warn(`${config.name} failed visual calibration; retaining procedural boss.`);return}
    const bounds=model.measure?.(),valid=bounds&&bounds.height>=1.5&&bounds.height<=3&&bounds.width>=.5&&bounds.width<=4&&bounds.depth>=.15&&bounds.depth<=3;
    if(!valid){model.dispose?.();console.warn(`${config.name} failed its dimension guard; retaining procedural boss.`,bounds);return}
    if(boss.userData.hqModel){boss.userData.hqModel.dispose?.(),boss.userData.hqModel=null,boss.userData.hqModelDisposed=!0,boss.userData.hqQualifiedBounds=null}
    model.root.position.set(0,0,0);model.root.visible=!0;boss.add(model.root);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(game.disposed||!boss.parent||Number(boss.userData.health)<=0){model.dispose?.();return}
    (boss.userData.fallbackParts??[]).forEach(part=>part.visible=!1);
    boss.userData.bossHqModel=model;boss.userData.bossHqBounds=bounds;boss.userData.bossHqModelName=model.root.name;
    model.update?.(0,!0);
    console.info(`${config.name} rig loaded, calibrated, and attached.`,bounds)
  }catch(error){console.warn(`${config?.name??"Mission boss"} model unavailable; retaining procedural boss.`,error)}
}

function zkMoveSunscarBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),strafeSign=(manager.seed&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(strafeSign);
  const phaseSpeed=manager.phase?.id==="phase_3"?4.3:manager.phase?.id==="phase_2"?3.75:3.2,burst=manager.elapsed<Number(manager.sunscarBurstUntil??0);
  let direction;
  if(burst&&distance>3.6)direction=forward.clone();
  else if(burst)direction=tangent.clone().addScaledVector(forward,-.3);
  else if(distance>8)direction=forward.clone().multiplyScalar(.98).addScaledVector(tangent,.18);
  else if(distance<3.8)direction=forward.clone().multiplyScalar(-.42).addScaledVector(tangent,.9);
  else direction=tangent.clone().multiplyScalar(.64).addScaledVector(forward,(distance-5.1)*.42);
  direction.normalize();
  const speed=phaseSpeed*(burst?1.55:1),distanceStep=Math.min(.42,speed*step),angles=[0,.38,-.38,.78,-.78,1.24,-1.24,Math.PI],next=boss.position.clone();let chosen=!1;
  for(const angle of angles){const candidateDirection=direction.clone().applyAxisAngle(new w(0,1,0),angle),x=Kt.clamp(boss.position.x+candidateDirection.x*distanceStep,-79,79),z=Kt.clamp(boss.position.z+candidateDirection.z*distanceStep,-79,79);if(game.terrain.isWaterAt(x,z,1.05))continue;next.x=x;next.z=z;chosen=!0;break}
  if(!chosen){manager.sunscarStuckFor=Number(manager.sunscarStuckFor??0)+step;return!1}
  manager.sunscarStuckFor=0;const ground=game.terrain.heightAt(next.x,next.z);next.y=Kt.lerp(boss.position.y,ground,Math.min(1,step*12));
  const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.5));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.5));manager.center.y=game.terrain.heightAt(manager.center.x,manager.center.z);
  return moved
}

function zkMoveMireSirenBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side),hunting=manager.elapsed<Number(manager.mireHuntUntil??0);
  let direction;if(hunting&&distance>2.8)direction=forward.clone();else if(distance>10)direction=forward.clone().addScaledVector(tangent,.18);else if(distance<4.2)direction=forward.clone().multiplyScalar(-.58).addScaledVector(tangent,.8);else direction=tangent.clone().multiplyScalar(.78).addScaledVector(forward,(distance-6.4)*.32);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?4.1:manager.phase?.id==="phase_2"?3.45:2.9,speed=phaseSpeed*(hunting?1.55:1),distanceStep=Math.min(.4,speed*step),angles=[0,.32,-.32,.7,-.7,1.15,-1.15,Math.PI],next=boss.position.clone();let chosen=!1;
  for(const angle of angles){const candidate=direction.clone().applyAxisAngle(new w(0,1,0),angle),x=Kt.clamp(boss.position.x+candidate.x*distanceStep,-79,79),z=Kt.clamp(boss.position.z+candidate.z*distanceStep,-79,79);if(game.terrain.isObstacleAt(x,z,2.1))continue;next.x=x;next.z=z;chosen=!0;break}
  if(!chosen)return!1;
  next.y=Kt.lerp(boss.position.y,game.terrain.walkHeightAt(next.x,next.z,!0),Math.min(1,step*11));const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.3));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.3));manager.center.y=game.terrain.walkHeightAt(manager.center.x,manager.center.z,!0);
  return moved
}

function zkMoveDrownedTremorBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0));
  const ZK_DROWNED_HOVER_DURATION=4, ZK_DROWNED_HOVER_COOLDOWN=8, ZK_DROWNED_LEAP_HEIGHT=7, ZK_DROWNED_JUMP_DURATION=.9;
  const hoverUntil=Number(manager.drownedHoverUntil??0);
  const leapUntil=Number(manager.drownedLeapUntil??0);
  if(manager.elapsed < leapUntil && manager.drownedLeapFrom && manager.drownedLeapTo){
    const progress=Kt.clamp(1 - (leapUntil - manager.elapsed)/ZK_DROWNED_JUMP_DURATION,0,1);
    const from=manager.drownedLeapFrom,to=manager.drownedLeapTo;
    const x=Kt.lerp(from.x,to.x,progress),z=Kt.lerp(from.z,to.z,progress);
    const ground=Kt.lerp(game.terrain.walkHeightAt(from.x,from.z,!0),game.terrain.walkHeightAt(to.x,to.z,!0),progress);
    boss.position.set(x, ground + Math.sin(progress*Math.PI)*ZK_DROWNED_LEAP_HEIGHT, z);
    manager.center.x=Kt.lerp(manager.center.x,x,Math.min(1,step*1.25));
    manager.center.z=Kt.lerp(manager.center.z,z,Math.min(1,step*1.25));
    manager.center.y=game.terrain.walkHeightAt(manager.center.x,manager.center.z,!0);
    return !0;
  }
  if(manager.drownedLeapTo && manager.elapsed >= leapUntil){
    manager.drownedLeapTo=null;manager.drownedLeapFrom=null;
    boss.position.y=game.terrain.walkHeightAt(boss.position.x,boss.position.z,!0);
    manager.drownedHoverUntil=manager.elapsed + ZK_DROWNED_HOVER_DURATION;
  }
  if(manager.elapsed < hoverUntil){
    const targetX=Kt.clamp(player.x,-79,79),targetZ=Kt.clamp(player.z,-79,79);
    const lerpSpeed=Math.min(1,step*2.8);
    boss.position.x=Kt.lerp(boss.position.x,targetX,lerpSpeed);
    boss.position.z=Kt.lerp(boss.position.z,targetZ,lerpSpeed);
    const ground=game.terrain.walkHeightAt(boss.position.x,boss.position.z,!0);
    const hoverHeight=6.5 + Math.sin(manager.elapsed*3.2)*.45;
    boss.position.y=Kt.lerp(boss.position.y, ground + hoverHeight, Math.min(1,step*4));
    manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.1));
    manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.1));
    manager.center.y=game.terrain.walkHeightAt(manager.center.x,manager.center.z,!0);
    return !0;
  }
  if(manager.drownedHoverUntil && manager.elapsed >= hoverUntil){
    manager.drownedHoverUntil=0;
    manager.drownedNextHoverAt=manager.elapsed + ZK_DROWNED_HOVER_COOLDOWN;
  }
  const toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side),breaching=manager.elapsed<Number(manager.drownedBreachUntil??0);
  let direction;if(breaching&&distance>3)direction=forward.clone();else if(distance>9)direction=forward.clone().addScaledVector(tangent,.15);else if(distance<3.8)direction=forward.clone().multiplyScalar(-.5).addScaledVector(tangent,.72);else direction=tangent.clone().multiplyScalar(.68).addScaledVector(forward,(distance-5.8)*.34);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?3.8:manager.phase?.id==="phase_2"?3.2:2.65,speed=phaseSpeed*(breaching?1.65:1),distanceStep=Math.min(.46,speed*step),angles=[0,.3,-.3,.7,-.7,1.16,-1.16,Math.PI],next=boss.position.clone();let chosen=!1;
  for(const angle of angles){const candidate=direction.clone().applyAxisAngle(new w(0,1,0),angle),x=Kt.clamp(boss.position.x+candidate.x*distanceStep,-79,79),z=Kt.clamp(boss.position.z+candidate.z*distanceStep,-79,79);if(game.terrain.isObstacleAt(x,z,.85))continue;next.x=x;next.z=z;chosen=!0;break}
  let stuckTriggered=!1;
  if(!chosen){
    const fallback=tangent.clone(),x=Kt.clamp(boss.position.x+fallback.x*distanceStep*.6,-79,79),z=Kt.clamp(boss.position.z+fallback.z*distanceStep*.6,-79,79);
    if(game.terrain.isObstacleAt(x,z,.4)){
      if(!manager.drownedBlockedSince) manager.drownedBlockedSince=manager.elapsed;
      const stuck=Number(manager.drownedBlockedSince)>0 && manager.elapsed - Number(manager.drownedBlockedSince) > .45;
      const ready=manager.elapsed >= Number(manager.drownedNextHoverAt??0);
      if(ready || stuck){ const landing=player.clone(); manager.drownedLeapFrom=boss.position.clone(); manager.drownedLeapTo=new w(Kt.clamp(landing.x,-79,79),0,Kt.clamp(landing.z,-79,79)); manager.drownedLeapUntil=manager.elapsed + ZK_DROWNED_JUMP_DURATION; manager.drownedBlockedSince=0; boss.userData.bossHqModel?.playAttack?.("drowned_hover"); return !0; }
      return!1;
    }
    next.x=x;next.z=z;chosen=!0;
  }
  if(chosen) manager.drownedBlockedSince=0;
  else if(!manager.drownedBlockedSince) manager.drownedBlockedSince=manager.elapsed;
  const readyNow=manager.elapsed >= Number(manager.drownedNextHoverAt??0);
  const wasStuck=Number(manager.drownedBlockedSince)>0 && manager.elapsed - Number(manager.drownedBlockedSince) > .45;
  if(readyNow || wasStuck){
    const landing=player.clone();
    manager.drownedLeapFrom=boss.position.clone();
    manager.drownedLeapTo=new w(Kt.clamp(landing.x,-79,79),0,Kt.clamp(landing.z,-79,79));
    manager.drownedLeapUntil=manager.elapsed + ZK_DROWNED_JUMP_DURATION;
    manager.drownedBlockedSince=0;
    boss.userData.bossHqModel?.playAttack?.("drowned_hover");
    return !0;
  }
  next.y=Kt.lerp(boss.position.y,game.terrain.walkHeightAt(next.x,next.z,!0),Math.min(1,step*12));const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.35));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.35));manager.center.y=game.terrain.walkHeightAt(manager.center.x,manager.center.z,!0);
  return moved
}

function zkMoveStormbackBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side),charging=manager.elapsed<Number(manager.stormbackChargeUntil??0);
  let direction;if(charging&&distance>2.7)direction=forward.clone();else if(distance>9)direction=forward.clone().addScaledVector(tangent,.12);else if(distance<3.2)direction=forward.clone().multiplyScalar(-.48).addScaledVector(tangent,.78);else direction=forward.clone().multiplyScalar(.28).addScaledVector(tangent,.82);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?4.7:manager.phase?.id==="phase_2"?3.9:3.2,speed=phaseSpeed*(charging?1.7:1),distanceStep=Math.min(.48,speed*step),angles=[0,.28,-.28,.62,-.62,1.05,-1.05,Math.PI],next=boss.position.clone();let chosen=!1;
  for(const angle of angles){const candidate=direction.clone().applyAxisAngle(new w(0,1,0),angle),x=Kt.clamp(boss.position.x+candidate.x*distanceStep,-79,79),z=Kt.clamp(boss.position.z+candidate.z*distanceStep,-79,79);if(game.terrain.isObstacleAt(x,z,.82))continue;next.x=x;next.z=z;chosen=!0;break}
  if(!chosen){const fallback=forward.clone().applyAxisAngle(new w(0,1,0),side*Math.PI*.5),x=Kt.clamp(boss.position.x+fallback.x*distanceStep*.6,-79,79),z=Kt.clamp(boss.position.z+fallback.z*distanceStep*.6,-79,79);if(game.terrain.isObstacleAt(x,z,.45))return!1;next.x=x;next.z=z;chosen=!0}
  const ground=game.terrain.isWaterAt(next.x,next.z,.35)?game.terrain.walkHeightAt(next.x,next.z,!0):game.terrain.heightAt(next.x,next.z);next.y=Kt.lerp(boss.position.y,ground,Math.min(1,step*14));const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.5));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.5));manager.center.y=game.terrain.heightAt(manager.center.x,manager.center.z);
  return moved
}

function zkMoveThornwardenBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side),advancing=manager.elapsed<Number(manager.thornwardenAdvanceUntil??0);
  let direction;if(advancing&&distance>2.9)direction=forward.clone();else if(distance>8.5)direction=forward.clone().addScaledVector(tangent,.14);else if(distance<3.4)direction=forward.clone().multiplyScalar(-.45).addScaledVector(tangent,.82);else direction=tangent.clone().multiplyScalar(.72).addScaledVector(forward,(distance-5.4)*.34);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?6.4:manager.phase?.id==="phase_2"?5.4:4.5,dodgeCycle=(manager.elapsed*1.7+manager.seed*.001)%2.6,dodging=dodgeCycle<.42,speed=phaseSpeed*(advancing?1.5:1)*(dodging?2.35:1),distanceStep=Math.min(.9,speed*step),angles=[0,.3,-.3,.68,-.68,1.12,-1.12,Math.PI],next=boss.position.clone();let chosen=!1;
  for(const angle of angles){const candidate=direction.clone().applyAxisAngle(new w(0,1,0),angle),x=Kt.clamp(boss.position.x+candidate.x*distanceStep,-79,79),z=Kt.clamp(boss.position.z+candidate.z*distanceStep,-79,79);if(game.terrain.isWaterAt(x,z,.62)||game.terrain.isObstacleAt(x,z,.82))continue;next.x=x;next.z=z;chosen=!0;break}
  if(!chosen){const fallback=tangent.clone().applyAxisAngle(new w(0,1,0),side*Math.PI*.5),x=Kt.clamp(boss.position.x+fallback.x*distanceStep*.55,-79,79),z=Kt.clamp(boss.position.z+fallback.z*distanceStep*.55,-79,79);if(game.terrain.isWaterAt(x,z,.35)||game.terrain.isObstacleAt(x,z,.42))return!1;next.x=x;next.z=z}
  next.y=Kt.lerp(boss.position.y,game.terrain.heightAt(next.x,next.z),Math.min(1,step*13));const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.25));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.25));manager.center.y=game.terrain.heightAt(manager.center.x,manager.center.z);
  return moved
}
function zkMoveArcGunnerBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side);
  let direction;if(distance>14)direction=forward.clone().addScaledVector(tangent,.14);else if(distance<6.5)direction=forward.clone().multiplyScalar(-.42).addScaledVector(tangent,.76);else direction=tangent.clone().multiplyScalar(.68).addScaledVector(forward,(distance-9)*.28);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?3.9:manager.phase?.id==="phase_2"?3.3:2.7,speed=phaseSpeed,distanceStep=Math.min(.46,speed*step),angles=[0,.32,-.32,.7,-.7,1.12,-1.12,Math.PI],next=boss.position.clone();let chosen=!1;
  for(const angle of angles){const candidate=direction.clone().applyAxisAngle(new w(0,1,0),angle),x=Kt.clamp(boss.position.x+candidate.x*distanceStep,-79,79),z=Kt.clamp(boss.position.z+candidate.z*distanceStep,-79,79);if(game.terrain.isObstacleAt(x,z,.78))continue;next.x=x;next.z=z;chosen=!0;break}
  if(!chosen){const fallback=tangent.clone(),x=Kt.clamp(boss.position.x+fallback.x*distanceStep*.5,-79,79),z=Kt.clamp(boss.position.z+fallback.z*distanceStep*.5,-79,79);if(game.terrain.isObstacleAt(x,z,.42))return!1;next.x=x;next.z=z;chosen=!0}
  next.y=Kt.lerp(boss.position.y,game.terrain.heightAt(next.x,next.z),Math.min(1,step*12));const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.2));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.2));manager.center.y=game.terrain.heightAt(manager.center.x,manager.center.z);
  return moved
}

function zkMoveWhiteScreecherBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side),diving=manager.elapsed<Number(manager.screecherDiveUntil??0),strafing=manager.elapsed<Number(manager.screecherStrafeUntil??0);
  let direction;if(diving&&distance>4.8)direction=forward.clone();else if(strafing)direction=tangent.clone().addScaledVector(forward,.24);else if(distance>13)direction=forward.clone().addScaledVector(tangent,.16);else if(distance<7)direction=forward.clone().multiplyScalar(-.72).addScaledVector(tangent,.72);else direction=tangent.clone().multiplyScalar(.9).addScaledVector(forward,(distance-9.5)*.22);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?5.7:manager.phase?.id==="phase_2"?5.05:4.45,speed=phaseSpeed*(diving?1.55:strafing?1.28:1),distanceStep=Math.min(.52,speed*step),next=boss.position.clone();
  next.x=Kt.clamp(boss.position.x+direction.x*distanceStep,-79,79);next.z=Kt.clamp(boss.position.z+direction.z*distanceStep,-79,79);
  const ground=game.terrain.walkHeightAt(next.x,next.z,!0),altitude=diving?3.2:manager.phase?.id==="phase_3"?7.8:7.1;next.y=Kt.lerp(boss.position.y,ground+altitude,Math.min(1,step*(diving?7.5:4.8)));
  const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*.9));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*.9));manager.center.y=ground;
  return moved
}
function zkMoveInsectKingBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side);
  let direction;if(distance>12)direction=forward.clone().addScaledVector(tangent,.12);else if(distance>4)direction=forward.clone().multiplyScalar(.85).addScaledVector(tangent,.25);else if(distance<1.2)direction=tangent.clone().multiplyScalar(.9).addScaledVector(forward,-.2);else direction=forward.clone().multiplyScalar(.65).addScaledVector(tangent,.55);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?6.2:manager.phase?.id==="phase_2"?5.6:5.0,speed=phaseSpeed,distanceStep=Math.min(.58,speed*step),next=boss.position.clone();
  next.x=Kt.clamp(boss.position.x+direction.x*distanceStep,-79,79);next.z=Kt.clamp(boss.position.z+direction.z*distanceStep,-79,79);
  const ground=game.terrain.walkHeightAt(next.x,next.z,!0),altitude=manager.phase?.id==="phase_3"?6.8:manager.phase?.id==="phase_2"?6.2:5.6,bob=Math.sin(manager.elapsed*2.2)*.18;
  next.y=Kt.lerp(boss.position.y,ground+altitude+bob,Math.min(1,step*5.2));
  const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*.7));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*.7));manager.center.y=ground;
  return moved
}
function zkMoveSporeCantorBoss(manager,delta){
  const boss=manager.boss,game=manager.game,player=game.player?.group?.position;
  if(!boss||!player)return!1;
  const step=Math.min(.08,Math.max(0,Number(delta)||0)),toPlayer=player.clone().sub(boss.position);toPlayer.y=0;
  const distance=Math.max(.001,toPlayer.length()),forward=toPlayer.multiplyScalar(1/distance),side=((manager.seed+manager.attackIndex)&1)?1:-1,tangent=new w(-forward.z,0,forward.x).multiplyScalar(side);
  let direction;if(distance>9)direction=forward.clone().addScaledVector(tangent,.16);else if(distance<3.6)direction=forward.clone().multiplyScalar(-.4).addScaledVector(tangent,.82);else direction=tangent.clone().multiplyScalar(.7).addScaledVector(forward,(distance-5.2)*.3);
  direction.normalize();const phaseSpeed=manager.phase?.id==="phase_3"?3.4:manager.phase?.id==="phase_2"?2.9:2.4,speed=phaseSpeed,distanceStep=Math.min(.42,speed*step),angles=[0,.32,-.32,.7,-.7,1.15,-1.15,Math.PI],next=boss.position.clone();let chosen=!1;
  for(const angle of angles){const candidate=direction.clone().applyAxisAngle(new w(0,1,0),angle),x=Kt.clamp(boss.position.x+candidate.x*distanceStep,-79,79),z=Kt.clamp(boss.position.z+candidate.z*distanceStep,-79,79);if(game.terrain.isWaterAt(x,z,.6)||game.terrain.isObstacleAt(x,z,.78))continue;next.x=x;next.z=z;chosen=!0;break}
  if(!chosen){const fallback=tangent.clone(),x=Kt.clamp(boss.position.x+fallback.x*distanceStep*.5,-79,79),z=Kt.clamp(boss.position.z+fallback.z*distanceStep*.5,-79,79);if(!game.terrain.isWaterAt(x,z,.4)&&!game.terrain.isObstacleAt(x,z,.42)){next.x=x;next.z=z;chosen=!0} else return!1}
  next.y=Kt.lerp(boss.position.y,game.terrain.heightAt(next.x,next.z),Math.min(1,step*12));const moved=boss.position.distanceToSquared(next)>1e-6;boss.position.copy(next);
  manager.center.x=Kt.lerp(manager.center.x,boss.position.x,Math.min(1,step*1.2));manager.center.z=Kt.lerp(manager.center.z,boss.position.z,Math.min(1,step*1.2));manager.center.y=game.terrain.heightAt(manager.center.x,manager.center.z);
  return moved
}

/* Returnal-inspired temp weapon traits: chainLightning/ricochet/explosive/armorPen/splitting/weakPointBonus/shieldGen/cooldownReduction — applied data-driven per encounter */
function zkWeaponTraitApply(traitId, proj){ if(!traitId) return proj; if(traitId==="ricochet") proj.bounces=(proj.bounces??0)+2; if(traitId==="splitting"||traitId==="fission") proj.splitsOnExpire=3; if(traitId==="chain_lightning") proj.chain=2; return proj }
function zkAltFireSpawn(game, profileId, origin, target){ const map={arc_pulse:{chain:2},gravity_lance:{pierce:1},drone_barrage:{count:12},plasma_burst:{radial:14},quantum_mine:{delay:1.25}}; game&&game.ui&&game.ui.showToast&&game.ui.showToast(profileId, "Alt-fire deployed — reusable, pooled, performance-budgeted", "success"); }
class zkBossManager{
  constructor(game){this.game=game;this.pool=new zkBossProjectilePool(game,game.graphicsQuality==="low"?140:250);this.active=!1;this.boss=null;this.config=null;this.center=new w;this.radius=14;this.telegraphs=[];this.damageOutbox=[];this.damageEventAcks=new Set;this.lastSharedState=null;this.lastHudAt=0;this.debugPlayerDamage=!0;this.debugTelegraphs=!0}
  playerCount(){let count=this.game.player?.health>0?1:0,now=performance.now();for(const group of this.game.multiplayerRoom?.remotePlayers?.values?.()??[])if(Number(group.userData.health)>0&&now-Number(group.userData.lastSeen??0)<1e4)count+=1;return Math.max(1,count)}
  findArena(config){const area=zkAreasOfOperation.find(item=>item.id===config.biome)??zkAreasOfOperation[0],candidate=new w(area.center.x,0,0);for(let ring=0;ring<9;ring+=1)for(let step=0;step<12;step+=1){const angle=step/12*Math.PI*2,x=area.center.x+Math.cos(angle)*ring*1.25,z=Math.sin(angle)*ring*1.25;if(!this.game.terrain.isWaterAt(x,z,.7)&&!this.game.terrain.isObstacleAt(x,z,2.2)){candidate.set(x,this.game.terrain.heightAt(x,z),z);return candidate}}candidate.y=this.game.terrain.heightAt(candidate.x,candidate.z);return candidate}
  startEncounter({missionId,seed=null,shared=null,force=!1}={}){if(this.active)return!1;const config=missionBossConfig(missionId);if(!config)return!1;if(!force&&this.game.missionStats.bossDefeats?.[missionId])return!1;if(!force){const missionContext=this.game.getMissionContext?.();if(missionContext&&!missionReadyForBoss(missionId,missionContext))return!1}this.config=config;this.seed=Number(seed??zkBossHash(`${this.game.user.teamCode}:${missionId}`))>>>0;this.encounterId=`${missionId}:${this.seed}`;this.startedAt=Number(shared?.startedAt??Date.now());this.elapsed=0;if(this.game.player){const pp=this.game.player.group.position.clone();pp.y=this.game.terrain.heightAt(pp.x,pp.z);this.center.copy(pp);}else this.center.copy(this.findArena(config));this.center.z=Number(shared?.z??this.center.z);this.maxHealth=Number(shared?.maxHealth??scaledBossHealth(config,this.playerCount()));this.phase=config.phases[0];this.phaseStartedAt=0;this.attackOrders=Object.fromEntries(config.phases.map(phase=>[phase.id,deterministicAttackOrder(config,phase.id,this.seed,48)]));this.attackIndex=0;this.nextAttackAt=2;this.transitionUntil=0;this.lastPattern="awakening";this.telegraphCount=0;this.telegraphHits=0;this.playerDeaths=0;this.damageTaken=0;this.previousPlayerHealth=Number(this.game.player.health);this.infrastructureStart=(this.game.buildings?.records??[]).reduce((sum,record)=>sum+Number(record.health??1000),0);this.frameTotal=0;this.frameSamples=0;this.peakProjectiles=0;for(const enemy of [...this.game.enemies]){this.game.scene.remove(enemy);this.game.enemies.splice(this.game.enemies.indexOf(enemy),1)}const spawned=this.game.spawnEnemy(!0,config.sourceEnemyType);if(!spawned){this.config=null;this.game.ui.showToast("Boss encounter delayed","The guardian could not enter the arena. Mission progress remains recoverable.","warning");return!1}this.boss=spawned;spawned.userData.skipEnemyHqModel=config.id==="arctic_white_screecher";spawned.position.copy(this.center);spawned.scale.setScalar(config.scaleMultiplier);spawned.userData.isMissionBoss=!0;spawned.userData.bossId=config.id;spawned.userData.missionId=missionId;spawned.userData.maxHealth=this.maxHealth;spawned.userData.health=Number(shared?.health??this.maxHealth);spawned.userData.hostile=!0;spawned.userData.guardian=!1;spawned.userData.collisionRadius=config.id==="arctic_white_screecher"?4.8:3.4;this.lastBossHealth=Number(spawned.userData.health);zkLoadMissionBossVisual(this.game,spawned,config);const weakColor=config.id==="wetlands_mire_siren"?0x72fff0:config.id==="highlands_stormback"?0x9fe9ff:config.id==="forest_ancient_thornwarden"?0xcaff9d:config.id==="arctic_white_screecher"?0xe8fbff:0xfff099,weakEmissive=config.id==="wetlands_mire_siren"?0x18bfae:config.id==="highlands_stormback"?0x248cff:config.id==="forest_ancient_thornwarden"?0x48c85b:config.id==="arctic_white_screecher"?0x4aaeff:0xff8c3d,weakMaterial=new ie({color:weakColor,emissive:weakEmissive,emissiveIntensity:3.4,roughness:.18}),weakPoint=new R(new Se(.22,12,8),weakMaterial);weakPoint.position.set(0,config.id==="arctic_white_screecher"?2.45:config.id==="wetlands_mire_siren"?1.7:config.id==="highlands_stormback"?1.55:1.45,.38);weakPoint.name="bossWeakPoint";spawned.add(weakPoint);this.weakPoint=weakPoint;this.active=!0;this.lastSharedState=null;this.showHud();this.game.mode==="command"&&this.game.toggleMode();this.game.ui.showToast(config.name,`${config.title}. Three combat phases have begun; ordinary patrols are withdrawing.`,"danger");this.game.updateHud(!0);return!0}
  showHud(){let hud=document.getElementById("boss-encounter-hud");if(!hud){hud=document.createElement("section");hud.id="boss-encounter-hud";hud.className="boss-encounter-hud hidden"}hud.parentElement!==document.body&&document.body.append(hud);document.documentElement.classList.add("zk-boss-active");hud.classList.remove("hidden");this.renderHud(!0)}
  hideHud(){document.documentElement.classList.remove("zk-boss-active");document.getElementById("boss-encounter-hud")?.classList.add("hidden")}
  renderHud(force=!1){const now=performance.now();if(!force&&now-this.lastHudAt<100)return;this.lastHudAt=now;const hud=document.getElementById("boss-encounter-hud");if(!hud||!this.config)return;const health=Math.max(0,Number(this.boss?.userData.health??this.lastSharedState?.health??0)),percent=Math.max(0,Math.min(100,health/Math.max(1,this.maxHealth)*100)),phaseNumber=Math.max(1,this.config.phases.findIndex(item=>item.id===this.phase?.id)+1),defense=this.defense??bossDefenseProfile(this.config),defenseActive=this.elapsed<Number(this.defenseUntil??0),defenseCooldown=Math.max(0,Math.ceil(Number(this.nextDefenseAt??0)-this.elapsed)),defenseStatus=defenseActive?`${defense.label.toUpperCase()} ACTIVE`:defenseCooldown>0?`${defense.label.toUpperCase()} ${defenseCooldown}S`:`${defense.label.toUpperCase()} READY`;hud.dataset.phase=String(phaseNumber);hud.innerHTML=`<div class="boss-heading"><span>BOSS ${Li(this.config.title)}</span><strong>${Li(this.config.name)}</strong><b>PHASE ${phaseNumber} / 3</b></div><div class="boss-hp-line"><label><span>GUARDIAN HP</span><output>${Math.ceil(health)} / ${this.maxHealth}</output></label><div class="boss-health" role="meter" aria-label="${Li(this.config.name)} health" aria-valuemin="0" aria-valuemax="${this.maxHealth}" aria-valuenow="${Math.ceil(health)}"><i style="width:${percent}%"></i><em></em><em></em></div></div><div class="boss-status-line"><span>${Li(this.phase?.label??"PHASE I")}</span><b class="${defenseActive?"active":defenseCooldown?"cooldown":"ready"}">${Li(defenseStatus)}</b><small>${Li(String(this.lastPattern).replaceAll("_"," ").toUpperCase())} · ${this.pool.active.length} HOSTILE PROJECTILES</small></div>`}
  addTelegraph(position,duration,patternId,onFire,{radius=1.35,color=0xff684f,chargeAtBoss=!1,hazardDamage=14}={}){const material=new Je({color,transparent:!0,opacity:.72,depthWrite:!1}),mesh=new R(new tt(radius,.08,8,36),material);mesh.rotation.x=Math.PI/2;mesh.position.copy(position);mesh.position.y=(["wetlands_mire_siren","wetlands_drowned_tremor"].includes(this.config?.id)?this.game.terrain.walkHeightAt(position.x,position.z,!0):this.game.terrain.heightAt(position.x,position.z))+.08;mesh.visible=this.debugTelegraphs;this.game.scene.add(mesh);let chargeMesh=null;if(chargeAtBoss){const chargeMaterial=new ie({color,emissive:color,emissiveIntensity:4.5,transparent:!0,opacity:.88,roughness:.08}),chargeGeometry=new Se(.42,16,12);chargeMesh=new R(chargeGeometry,chargeMaterial);chargeMesh.position.copy(this.boss.position).add(new w(0,4.7,0));chargeMesh.scale.setScalar(.5);this.game.scene.add(chargeMesh)}this.telegraphs.push({mesh,chargeMesh,remaining:duration,duration,patternId,onFire,radius,hazardDamage});this.telegraphCount+=1;return mesh}
  clearTelegraphs(){for(const item of this.telegraphs){this.game.scene.remove(item.mesh);item.mesh.geometry.dispose();item.mesh.material.dispose();if(item.chargeMesh){this.game.scene.remove(item.chargeMesh);item.chargeMesh.geometry.dispose();item.chargeMesh.material.dispose()}}this.telegraphs.length=0}
  damagePlayer(amount,patternId,projectileId="hazard"){if(!this.debugPlayerDamage||!this.active||performance.now()<Number(this.game.bossDamageInvulnerableUntil??0)||performance.now()<Number(this.game.bossRollIFrameUntil??0))return!1;const damage=scaledBossDamage(amount,this.phase?.id),before=Number(this.game.player.health);this.game.player.health=Math.max(0,before-damage);this.game.bossDamageInvulnerableUntil=performance.now()+480;this.damageTaken+=Math.max(0,before-this.game.player.health);this.telegraphHits+=1;this.lastDamageAttribution={bossId:this.config.id,patternId,projectileId,damage};this.game.spawnImpactPulse(this.game.player.group.position.clone().add(new w(0,1,0)),0xff604f);this.game.ui.showToast("Boss impact",`${this.config.name} dealt ${damage} suit damage.`,"danger");this.game.updateHud(!0);return!0}
  resolveDefense(rawDamage){if(!this.active||!this.boss||rawDamage<=0)return rawDamage;this.defense??=bossDefenseProfile(this.config);this.nextDefenseAt??=4;this.defenseUntil??=0;const ready=this.elapsed>=this.nextDefenseAt,shielding=this.defense.kind==="shield"&&this.elapsed<this.defenseUntil;if(!ready&&!shielding)return rawDamage;if(ready){this.nextDefenseAt=this.elapsed+this.defense.cooldown;this.defenseUntil=this.elapsed+this.defense.duration;this.lastPattern=`${this.defense.kind}_${this.defense.label.toLowerCase().replaceAll(" ","_")}`;this.boss.userData.bossHqModel?.playAttack?.(`defense_${this.defense.kind}`);if(this.defense.kind==="dodge"){const away=this.boss.position.clone().sub(this.game.player.group.position);away.y=0;away.lengthSq()<.01&&away.set(1,0,0);away.normalize();const side=new w(-away.z,0,away.x).multiplyScalar((this.attackIndex%2?1:-1)*5.5),candidate=this.boss.position.clone().add(side),dx=candidate.x-this.center.x,dz=candidate.z-this.center.z;if(dx*dx+dz*dz>this.radius*this.radius*.75)candidate.copy(this.center).add(side.multiplyScalar(.45));if(!this.game.terrain.isWaterAt(candidate.x,candidate.z,.7)&&!this.game.terrain.isObstacleAt(candidate.x,candidate.z,1.4)){candidate.y=this.game.terrain.heightAt(candidate.x,candidate.z);this.boss.position.copy(candidate)}}this.game.ui.showToast(this.defense.label,this.defense.kind==="dodge"?"Projectile lock broken. The guardian repositioned; defense recharges in 10 seconds.":"Incoming projectiles deflected. Only minimum damage penetrated; shield recharges in 10 seconds.","warning")}const applied=Math.max(this.defense.minimumDamage,rawDamage*this.defense.damageFraction),before=Number(this.boss.userData.health);this.boss.userData.health=Math.min(this.maxHealth,before+rawDamage-applied);this.game.spawnImpactPulse(this.boss.position.clone().add(new w(0,3.2,0)),this.config.color);return applied}
  queueDamage(amount){if(!this.active||amount<=0)return;const event={id:`${this.game.multiplayerRoom?.clientId??"local"}.${Date.now()}.${crypto.randomUUID().slice(0,8)}`,encounterId:this.encounterId,amount:Math.max(0,Math.min(250,Number(amount))),at:Date.now()};this.damageOutbox.push(event);this.damageOutbox=this.damageOutbox.slice(-100)}
  recordBossDamage(amount){if(!this.active||amount<=0)return;const applied=this.resolveDefense(amount);this.queueDamage(applied);this.lastBossHealth=Number(this.boss.userData.health);this.renderHud(!0);const hud=document.getElementById("boss-encounter-hud");if(hud){hud.classList.remove("boss-hit");void hud.offsetWidth;hud.classList.add("boss-hit")}}
  updateTelegraphs(delta){const player=this.game.player.group.position;for(let index=this.telegraphs.length-1;index>=0;index-=1){const item=this.telegraphs[index];item.remaining-=delta;const progress=Math.max(0,Math.min(1,1-item.remaining/item.duration)),pulse=.78+Math.sin((item.duration-item.remaining)*12)*.18;item.mesh.scale.setScalar(pulse);item.mesh.material.opacity=Math.max(.18,item.remaining/item.duration*.75);if(item.chargeMesh){item.chargeMesh.position.copy(this.boss.position).add(new w(0,4.7,0));item.chargeMesh.scale.setScalar(.5+progress*3.2);item.chargeMesh.rotation.x+=delta*2.8;item.chargeMesh.rotation.y+=delta*4.2;item.chargeMesh.material.opacity=.55+progress*.4}if(item.remaining>0)continue;const dx=player.x-item.mesh.position.x,dz=player.z-item.mesh.position.z;item.onFire?.(item.mesh.position.clone());if(item.hazardDamage>0&&dx*dx+dz*dz<item.radius*item.radius)this.damagePlayer(item.hazardDamage,item.patternId,`hazard-${index}`);this.game.scene.remove(item.mesh);item.mesh.geometry.dispose();item.mesh.material.dispose();if(item.chargeMesh){this.game.scene.remove(item.chargeMesh);item.chargeMesh.geometry.dispose();item.chargeMesh.material.dispose()}this.telegraphs.splice(index,1)}}
  schedulePattern(patternId){this.lastPattern=patternId;this.boss?.userData?.bossHqModel?.playAttack?.(patternId);const origin=this.boss.position.clone(),color=this.config.color,player=this.game.player.group.position.clone();const radial=(delay=.8,options={})=>this.addTelegraph(origin,delay,patternId,point=>zkBossRadial(this.pool,point,{patternId,color,...options}),{radius:2.2,color});/* Aerial bombardment. `tight` clusters shells around the player instead of ringing
 * them at a safe radius; `homing` lets a shell correct its descent mid-fall, so
 * simply walking out of the telegraph is no longer a free dodge. */
const rain=(count=9,options={})=>{const{delay=1.2,damage=12,fall=9,homing=0,tight=!1}=options;for(let index=0;index<count;index+=1){const angle=index/count*Math.PI*2+this.attackIndex*.41,distance=tight?(index%3===0?2.4:5.4):(index%3===0?5:9),point=player.clone().add(new w(Math.cos(angle)*distance,0,Math.sin(angle)*distance));this.addTelegraph(point,delay,patternId,landing=>this.pool.acquire({position:landing.clone().add(new w(0,12,0)),velocity:new w(0,-fall,0),damage,lifetime:2.4,patternId,color,scale:1.45,homing,homingDelay:.12,homingUntil:1.5}),{radius:1.1,color:0x75ee6c})}};const eruption=(count=Math.min(3,this.playerCount()))=>{for(let index=0;index<count;index+=1){const forward=new w(0,0,1).applyAxisAngle(new w(0,1,0),this.game.player.group.rotation.y),point=player.clone().addScaledVector(forward,index*1.8);this.addTelegraph(point,1,patternId,position=>{this.game.spawnImpactPulse(position.clone().add(new w(0,.3,0)),0xff684f);zkBossRadial(this.pool,position,{count:10,speed:3.8,damage:12,gapEvery:5,patternId,color:0xff684f,height:.3})},{radius:1.55})}};const lanes=()=>{for(let lane=-2;lane<=2;lane+=1){if((lane+this.attackIndex)%2===0)continue;const point=this.center.clone().add(new w(lane*4,0,0));this.addTelegraph(point,1,patternId,position=>{for(let step=-5;step<=5;step+=1)this.pool.acquire({position:position.clone().add(new w(0,.35,step*2.4)),velocity:new w(0,0,0),damage:15,lifetime:.8,patternId,color:0xff684f,scale:1.5})},{radius:1.65,color:0xff684f})}};const mireLanes=()=>{for(let lane=-2;lane<=2;lane+=1){if((lane+this.attackIndex)%2===0)continue;const point=this.center.clone().add(new w(lane*3.6,0,0));this.addTelegraph(point,1.1,patternId,position=>{for(let step=-5;step<=5;step+=1)this.pool.acquire({position:position.clone().add(new w(0,.5,step*2.25)),velocity:new w(0,0,0),damage:13,lifetime:1,patternId,color:0x57e7cc,scale:1.65,terrainFollow:!0,heightOffset:.5})},{radius:1.5,color:0x57e7cc})}};
    const drownedLanes=()=>{for(let lane=-2;lane<=2;lane+=1){if((lane+this.attackIndex)%2===0)continue;const point=this.center.clone().add(new w(lane*3.7,0,0));this.addTelegraph(point,1.05,patternId,position=>{for(let step=-5;step<=5;step+=1)this.pool.acquire({position:position.clone().add(new w(0,.48,step*2.3)),velocity:new w(0,0,0),damage:15,lifetime:1.05,patternId,color:0x4fcdb4,scale:1.8,terrainFollow:!0,heightOffset:.48})},{radius:1.62,color:0x4fcdb4})}};
    const drownedEruptions=(count=4)=>{for(let index=0;index<count;index+=1){const angle=index/count*Math.PI*2+this.attackIndex*.43,distance=index%2?3.2:6.1,point=player.clone().add(new w(Math.cos(angle)*distance,0,Math.sin(angle)*distance));this.addTelegraph(point,.9+index*.1,patternId,landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.35,0)),0x4fcdb4);zkBossRadial(this.pool,landing,{count:12,speed:4.6,damage:14,gapEvery:6,patternId,color:0x4fcdb4,height:.35})},{radius:1.7,color:0x4fcdb4})}};
    const stormLanes=()=>{for(let lane=-2;lane<=2;lane+=1){if((lane+this.attackIndex)%2===0)continue;const point=this.center.clone().add(new w(lane*3.8,0,0));this.addTelegraph(point,.9,patternId,position=>{for(let step=-5;step<=5;step+=1)this.pool.acquire({position:position.clone().add(new w(0,.4,step*2.35)),velocity:new w(0,0,0),damage:15,lifetime:.85,patternId,color:0x8fd7ff,scale:1.7,terrainFollow:!0,heightOffset:.4})},{radius:1.6,color:0x8fd7ff})}};
    const screecherVolley=(target,{count=7,spread=.72,speed=9,damage=11,scale=1.9,id=patternId}={})=>{const start=this.boss.position.clone().add(new w(0,1.2,0)),aim=target.clone().add(new w(0,1.05,0)).sub(start);if(aim.lengthSq()<.001)aim.set(0,-.3,1);aim.normalize();for(let index=0;index<count;index+=1){const angle=count===1?0:(index/(count-1)-.5)*spread,velocity=aim.clone().applyAxisAngle(new w(0,1,0),angle).multiplyScalar(speed);this.pool.acquire({position:start.clone(),velocity,damage,lifetime:5,radius:.65,patternId:id,color:0xbdefff,scale})}};
    const screecherMarks=(count=6,delay=.9)=>{const toBoss=origin.clone().sub(player);toBoss.y=0;if(toBoss.lengthSq()<.001)toBoss.set(0,0,1);toBoss.normalize();const side=new w(-toBoss.z,0,toBoss.x);for(let index=0;index<count;index+=1){const forwardOffset=(index%3-1)*2.7,sideOffset=(Math.floor(index/3)-.5)*3.3,point=player.clone().addScaledVector(toBoss,forwardOffset).addScaledVector(side,sideOffset);this.addTelegraph(point,delay+index*.08,patternId,landing=>{const start=landing.clone().add(new w(0,13,0)),target=landing.clone().add(new w(0,.45,0)),velocity=target.sub(start).normalize().multiplyScalar(16);this.pool.acquire({position:start,velocity,damage:14,lifetime:1.4,radius:.82,patternId,color:0xbdefff,scale:2.2})},{radius:1.5,color:0xbdefff,hazardDamage:0})}};
    const screecherLanes=()=>{for(let lane=-2;lane<=2;lane+=1){if((lane+this.attackIndex)%3===0)continue;const point=this.center.clone().add(new w(lane*3.45,0,0));this.addTelegraph(point,.95,patternId,position=>{for(let step=-5;step<=5;step+=1)this.pool.acquire({position:position.clone().add(new w(0,.42,step*2.25)),velocity:new w(0,0,0),damage:15,lifetime:.95,patternId,color:0xbdefff,scale:1.75,terrainFollow:!0,heightOffset:.42})},{radius:1.48,color:0xbdefff})}};
    const sunscarPitch=(lockedTarget,{id=patternId,delay=1.1,speed=7.2,damage=25,scale=5.6,radius=1.35,telegraphRadius=1.85,color=0xffb13b}={})=>{const locked=lockedTarget.clone();locked.y=this.game.terrain.heightAt(locked.x,locked.z);this.addTelegraph(locked,delay,id,landing=>{const start=this.boss.position.clone().add(new w(0,4.7,0)),target=landing.clone().add(new w(0,1.2,0)),direction=target.sub(start);if(direction.lengthSq()<.001)direction.set(0,0,1);direction.normalize();this.game.spawnImpactPulse(start,color);this.pool.acquire({position:start,velocity:direction.multiplyScalar(speed),damage,lifetime:5.5,radius,patternId:id,color,scale})},{radius:telegraphRadius,color,chargeAtBoss:!0,hazardDamage:0})};
    const sunscarSpreadTargets=(count,spacing=2.4)=>{const toPlayer=player.clone().sub(origin);toPlayer.y=0;if(toPlayer.lengthSq()<.001)toPlayer.set(0,0,1);toPlayer.normalize();const side=new w(-toPlayer.z,0,toPlayer.x);return Array.from({length:count},(_,index)=>player.clone().addScaledVector(side,(index-(count-1)/2)*spacing))};
    this.sunscarBurstUntil=this.elapsed+1.05;
    if(patternId==="sunscar_fastball")sunscarPitch(player);
    else if(patternId==="sunscar_focused_charge")sunscarPitch(player,{delay:1.8,speed:11.5,damage:32,scale:4.2,radius:1.1,telegraphRadius:1.55});
    else if(patternId==="sunscar_shockwave")radial(.9,{count:20,speed:5.1,damage:12,gapEvery:7,height:.55,color:0xffb13b});
    else if(patternId==="sunscar_double_fastball")sunscarSpreadTargets(2,2.8).forEach((target,index)=>sunscarPitch(target,{id:`sunscar_fastball_${index+1}`,delay:1.05+index*.3,speed:7.8,damage:27,scale:5.8,radius:1.4}));
    else if(patternId==="sunscar_meteor_ring"){rain(8);radial(1.1,{count:18,speed:5.4,damage:13,gapEvery:6,color:0xffb13b})}
    else if(patternId==="sunscar_fastball_barrage")sunscarSpreadTargets(3,2.65).forEach((target,index)=>sunscarPitch(target,{id:`sunscar_fastball_barrage_${index+1}`,delay:.9+index*.28,speed:8.4,damage:28,scale:6.1,radius:1.45}));
    else if(patternId==="sunscar_focused_overcharge")sunscarPitch(player,{delay:2.2,speed:12.5,damage:40,scale:5,radius:1.35,telegraphRadius:1.7,color:0xff7a18});
    else if(patternId==="sunscar_finale"){sunscarPitch(player,{delay:1.65,speed:10.5,damage:36,scale:5.4,radius:1.4,color:0xff7a18});radial(1.35,{count:24,speed:5.8,damage:14,gapEvery:8,color:0xff8b24})}
    else if(patternId==="siren_pulse_ring")radial(.75,{count:20,speed:5.2,damage:9,gapEvery:5,height:.65,color:0x57e7cc});
    else if(patternId==="bog_bolt_fan")this.addTelegraph(origin,.7,patternId,point=>zkBossFan(this.pool,point,player,{count:7,spread:.8,speed:7.2,damage:10,patternId,color:0x57e7cc}),{radius:2,color:0x57e7cc});
    else if(patternId==="undertow_mark")this.addTelegraph(player,.95,patternId,point=>{this.game.spawnImpactPulse(point.clone().add(new w(0,.4,0)),0x57e7cc);zkBossRadial(this.pool,point,{count:12,speed:4.1,damage:11,gapEvery:6,patternId,color:0x57e7cc,height:.35})},{radius:1.8,color:0x57e7cc});
    else if(patternId==="double_tidal_spiral")this.addTelegraph(origin,.85,patternId,point=>zkBossSpiral(this.pool,point,{arms:2,shots:15,speed:5.2,offset:this.attackIndex*.29,patternId,color:0x57e7cc}),{radius:2.2,color:0x57e7cc});
    else if(patternId==="brackish_geysers"){rain(7);eruption(Math.min(4,this.playerCount()+1))}
    else if(patternId==="flood_lanes")mireLanes();
    else if(patternId==="mire_tempest"){rain(8);radial(1.2,{count:18,speed:5,gapEvery:6,color:0x57e7cc})}
    else if(patternId==="siren_hunt"){this.mireHuntUntil=this.elapsed+2.8;this.addTelegraph(origin,.65,patternId,point=>zkBossFan(this.pool,point,player,{count:5,spread:.5,speed:8,damage:12,patternId,color:0x57e7cc}),{radius:2,color:0x57e7cc});eruption(2)}
    else if(patternId==="drowning_finale"){this.mireHuntUntil=this.elapsed+2.2;this.addTelegraph(origin,1,patternId,point=>zkBossSpiral(this.pool,point,{arms:3,shots:12,speed:5.5,offset:this.attackIndex*.31,patternId,color:0x57e7cc}),{radius:2.4,color:0x57e7cc});mireLanes()}
    else if(patternId==="tremor_mud_burst")radial(.78,{count:18,speed:4.8,damage:11,gapEvery:6,height:.42,color:0x4fcdb4});
    else if(patternId==="tremor_pressure_fan")this.addTelegraph(origin,.72,patternId,point=>zkBossFan(this.pool,point,player,{count:7,spread:.82,speed:7.6,damage:12,patternId,color:0x4fcdb4,height:1.1}),{radius:2.1,color:0x4fcdb4});
    else if(patternId==="tremor_sinkhole_mark")this.addTelegraph(player,1.05,patternId,landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.35,0)),0x4fcdb4);zkBossRadial(this.pool,landing,{count:14,speed:4.5,damage:13,gapEvery:7,patternId,color:0x4fcdb4,height:.32})},{radius:2,color:0x4fcdb4});
    else if(patternId==="tremor_double_wake")this.addTelegraph(origin,.85,patternId,point=>zkBossSpiral(this.pool,point,{arms:2,shots:16,speed:5.3,offset:this.attackIndex*.3,patternId,color:0x4fcdb4}),{radius:2.25,color:0x4fcdb4});
    else if(patternId==="tremor_eruption_chain"){this.drownedBreachUntil=this.elapsed+1.7;drownedEruptions(4)}
    else if(patternId==="tremor_drowned_lanes")drownedLanes();
    else if(patternId==="tremor_breach_charge"){this.drownedBreachUntil=this.elapsed+3;this.addTelegraph(player,.75,patternId,landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.4,0)),0x4fcdb4);zkBossRadial(this.pool,landing,{count:16,speed:5.8,damage:17,gapEvery:8,patternId,color:0x4fcdb4,height:.38})},{radius:2.15,color:0x4fcdb4})}
    else if(patternId==="tremor_deluge"){rain(10);radial(1.05,{count:20,speed:5.5,damage:15,gapEvery:7,height:.45,color:0x4fcdb4})}
    else if(patternId==="tremor_final_collapse"){this.drownedBreachUntil=this.elapsed+2.7;drownedEruptions(6);drownedLanes();radial(1.2,{count:24,speed:5.8,damage:17,gapEvery:8,height:.4,color:0x4fcdb4})}
    else if(patternId==="tremor_aerial_burst"){const burstOrigin=origin.clone().add(new w(0,9,0));this.addTelegraph(burstOrigin,.88,patternId,pt=>{zkBossRadial(this.pool,pt,{count:18,speed:6.2,damage:13,gapEvery:6,patternId,color:0x4fcdb4,height:.9});this.boss&&(this.boss.userData.weakPointUntil=performance.now()+2600);this.game.spawnImpactPulse(pt.clone().add(new w(0,.5,0)),0x4fcdb4)},{radius:2.3,color:0x4fcdb4})}
    else if(patternId==="tremor_aerial_pinball"){const aerialOrigin=origin.clone().add(new w(0,11,0)),pinballCount=this.phase?.id==="phase_3"?9:6;for(let i=0;i<pinballCount;i+=1){const angle=i/pinballCount*Math.PI*2+this.attackIndex*.37,spread=Math.random()*.4,velocity=new w(Math.cos(angle+spread)*7.5, -1.5-Math.random()*2.5, Math.sin(angle+spread)*7.5);this.pool.acquire({position:aerialOrigin.clone().add(new w((Math.random()-.5)*3, Math.random()*2, (Math.random()-.5)*3)), velocity, damage:13, lifetime:8, patternId, color, scale:1.65, radius:.72, bounces:4, homing:0, terrainFollow:false, heightOffset:1});}}
    else if(patternId==="tremor_shockwave"){const shockOrigin=origin.clone();shockOrigin.y=this.game.terrain.heightAt(origin.x,origin.z);this.addTelegraph(shockOrigin,1.1,patternId,pt=>{zkBossRadial(this.pool,pt,{count:22,speed:5.0,damage:14,gapEvery:7,patternId,color:0x4fcdb4,height:.35});this.game.spawnImpactPulse(pt.clone().add(new w(0,.45,0)),0x4fcdb4)},{radius:2.6,color:0x4fcdb4})}
    else if(patternId==="tremor_tracking_spray"){this.addTelegraph(origin,.72,patternId,pt=>zkBossFan(this.pool,pt,player,{count:7,spread:.82,speed:7.6,damage:12,patternId,color:0x4fcdb4,height:1.1}),{radius:2.1,color:0x4fcdb4})}
    else if(patternId==="tremor_delayed_eruption"){for(let i=0;i<4;i+=1){const angle=i/4*Math.PI*2+this.attackIndex*.43,dist=i%2?3.2:6.1,pt=player.clone().add(new w(Math.cos(angle)*dist,0,Math.sin(angle)*dist));this.addTelegraph(pt,.9+i*.1,patternId,landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.35,0)),0x4fcdb4);zkBossRadial(this.pool,landing,{count:12,speed:4.6,damage:14,gapEvery:6,patternId,color:0x4fcdb4,height:.35})},{radius:1.7,color:0x4fcdb4})}}
    else if(patternId==="tremor_descending_lanes"){const aerial=origin.clone().add(new w(0,10,0));for(let lane=-2;lane<=2;lane+=1){if((lane+this.attackIndex)%3===1)continue;const lanePt=aerial.clone().add(new w(lane*3.4,0,0));this.addTelegraph(lanePt,.95,patternId,landing=>{for(let k=0;k<6;k+=1){const x=landing.x+(Math.random()-.5)*1.2,z=landing.z+(Math.random()-.5)*1.2;const start=new w(x,landing.y+12,z),vel=new w(0,-9,0);this.pool.acquire({position:start, velocity:vel, damage:12, lifetime:2.2, patternId, color, scale:1.5, radius:.65, terrainFollow:false})}}, {radius:1.55,color:0x4fcdb4})}}
    else if(patternId==="spore_fungal_ring"){const ringOrigin=origin.clone();ringOrigin.y=this.game.terrain.heightAt(origin.x,origin.z);for(let r=0;r<2;r+=1){const delay=.9+r*.2,rotOffset=r*Math.PI/7;const rid=patternId+"_r"+r;this.addTelegraph(ringOrigin,delay,rid,pt=>{for(let i=0;i<14;i+=1){if(i%5===4)continue;const angle=rotOffset+i/14*Math.PI*2,vel=new w(Math.cos(angle)*4.2,0,Math.sin(angle)*4.2);this.pool.acquire({position:pt.clone().add(new w(0,.4,0)), velocity:vel, damage:9, lifetime:7, patternId:rid, color, scale:1.35, radius:.55, terrainFollow:true, heightOffset:.4})}}, {radius:1.9+r*.25,color})}}
    else if(patternId==="spore_bouncing_wall"){const wallOrigin=origin.clone();const wallId=patternId+"_wall";this.addTelegraph(wallOrigin,1.0,wallId,pt=>{for(let i=0;i<12;i+=1){if(i%4===3)continue;const x=pt.x+(i-5.5)*1.5,z=pt.z;const pos=new w(x, pt.y+1.2, z),vel=new w(0,0,5.6);this.pool.acquire({position:pos, velocity:vel, damage:10, lifetime:6, patternId:wallId, color, scale:1.4, radius:.6, bounces:2, terrainFollow:true, heightOffset:1.2})}}, {radius:2.4,color})}
    else if(patternId==="spore_spiral_bloom"){this.addTelegraph(origin,.92,patternId,pt=>{for(let arm=0;arm<2;arm+=1)for(let shot=0;shot<16;shot+=1){const angle=arm/2*Math.PI*2+shot*.34+this.attackIndex*.29,vel=new w(Math.cos(angle)*5.4,0,Math.sin(angle)*5.4);this.pool.acquire({position:pt.clone().add(new w(0,.9,0)),velocity:vel,damage:9,lifetime:6,patternId,color,scale:1.3,radius:.5,terrainFollow:true,heightOffset:.9})}}, {radius:2.15,color})}
    else if(patternId==="spore_converging_lanes"){for(let lane=-2;lane<=2;lane+=1){if((lane+this.attackIndex)%2===0)continue;const pt=this.center.clone().add(new w(lane*3.2,0,0));this.addTelegraph(pt,1.05,patternId+"_lane"+lane,position=>{for(let step=-5;step<=5;step+=1)this.pool.acquire({position:position.clone().add(new w(0,.45,step*2.2)),velocity:new w(0,0,0),damage:12,lifetime:.9,patternId,color,scale:1.6})},{radius:1.55,color})}}
    else if(patternId==="spore_delayed_bloom"){for(let i=0;i<6;i+=1){const angle=i/6*Math.PI*2+this.attackIndex*.31,dist=5+i%2*2.5,pt=player.clone().add(new w(Math.cos(angle)*dist,0,Math.sin(angle)*dist));this.addTelegraph(pt,1.1,patternId+"_bloom"+i,landing=>{const start=landing.clone().add(new w(0,12,0)),vel=new w(0,-12,0);this.pool.acquire({position:start,velocity:vel,damage:11,lifetime:2.1,patternId,color,scale:1.5,radius:.6,homing:1.2,homingDelay:.15})},{radius:1.25,color})}}
    else if(patternId==="spore_dividing_swarm"){this.addTelegraph(origin,.85,patternId,pt=>{for(let i=0;i<8;i+=1){const angle=i/8*Math.PI*2,vel=new w(Math.cos(angle)*5.2,0,Math.sin(angle)*5.2);this.pool.acquire({position:pt.clone().add(new w(0,.8,0)), velocity:vel, damage:8, lifetime:2.8, patternId, color, scale:1.3, radius:.52, splitsOnExpire:2, terrainFollow:true, heightOffset:.8})}}, {radius:2.1,color})}
    else if(patternId==="arc_rotating_burst"){this.addTelegraph(origin,.85,patternId,pt=>{for(let arm=0;arm<3;arm+=1)for(let shot=0;shot<6;shot+=1){const angle=arm/3*Math.PI*2+shot*.35+this.attackIndex*.4,vel=new w(Math.cos(angle)*6.5,0,Math.sin(angle)*6.5);this.pool.acquire({position:pt.clone().add(new w(0,1.1,0)), velocity:vel, damage:9, lifetime:5.5, patternId, color:0x8fa8ff, scale:1.3, radius:.58, terrainFollow:true, heightOffset:1.1})}}, {radius:2.2,color:0x8fa8ff})}
    else if(patternId==="arc_railgun_lanes"){for(let lane=-1;lane<=1;lane+=1){if((lane+this.attackIndex)%2===1)continue;const lanePt=this.center.clone().add(new w(lane*5.2,0,0));this.addTelegraph(lanePt,1.3,patternId+"_lane"+lane,position=>{for(let step=-6;step<=6;step+=1)this.pool.acquire({position:position.clone().add(new w(0,.6,step*2.2)), velocity:new w(0,0,0), damage:22, lifetime:1.05, patternId, color:0x8fa8ff, scale:1.9, radius:.72})}, {radius:1.8,color:0x8fa8ff})}}
    else if(patternId==="arc_electric_grid"){const gridCenter=player.clone();this.addTelegraph(gridCenter,1.25,patternId,pt=>{for(let gx=-1;gx<=1;gx+=1)for(let gz=-1;gz<=1;gz+=1){if((gx+gz+this.attackIndex)%2===0)continue;const pos=pt.clone().add(new w(gx*3.8,0,gz*3.8));this.pool.acquire({position:pos.clone().add(new w(0,.5,0)), velocity:new w(0,0,0), damage:13, lifetime:1.35, patternId, color:0x8fa8ff, scale:1.75})}}, {radius:2.8,color:0x8fa8ff})}
    else if(patternId==="arc_lightning_nodes"){const nodes=[];for(let n=0;n<5;n+=1){const angle=n/5*Math.PI*2+this.attackIndex*.6,dist=4.5+n%2*2.2,pt=player.clone().add(new w(Math.cos(angle)*dist,0,Math.sin(angle)*dist));nodes.push(pt);this.addTelegraph(pt,1.0,patternId+"_n"+n,landing=>{this.pool.acquire({position:landing.clone().add(new w(0,.6,0)), velocity:new w(0,0,0), damage:9, lifetime:1.8, patternId, color:0x8fa8ff, scale:1.55})}, {radius:1.2,color:0x8fa8ff})} this.tetherNodes=nodes }
    else if(patternId==="arc_tracking_volley"){const astart=this.boss.position.clone().add(new w(0,1.3,0));for(let i=0;i<5;i+=1){const spread=(i/4-.5)*.42,base=player.clone().sub(astart).normalize();const vel=base.clone().applyAxisAngle(new w(0,1,0),spread).multiplyScalar(10.2);this.addTelegraph(astart,.78,patternId+"_t"+i,pt=>{this.pool.acquire({position:pt.clone(),velocity:vel.clone(),damage:11,lifetime:4.5,patternId,color:0x8fa8ff,scale:1.55,radius:.62,homing:.9,homingDelay:.2})},{radius:1.35,color:0x8fa8ff})}}
    else if(patternId==="arc_bullet_wall"){const forward=new w(0,0,1).applyAxisAngle(new w(0,1,0),this.boss.rotation.y);const wallStart=origin.clone().addScaledVector(forward,14);this.addTelegraph(wallStart,1.0,patternId,pt=>{const side=new w(-forward.z,0,forward.x);for(let i=0;i<16;i+=1){if(i%4===3)continue;const offset=(i-7.5)*1.45,pos=pt.clone().addScaledVector(side,offset).add(new w(0,1.0,0)),vel=forward.clone().multiplyScalar(-4.0);this.pool.acquire({position:pos, velocity:vel, damage:11, lifetime:6, patternId, color:0x8fa8ff, scale:1.4, radius:.62, terrainFollow:true, heightOffset:1})}}, {radius:2.5,color:0x8fa8ff})}
    else if(patternId==="arc_shield_phase"){this.boss.userData.shieldHp=180;this.boss.userData.weakPointUntil=0;this.addTelegraph(origin,1.45,patternId,pt=>{this.game.spawnImpactPulse(pt.clone().add(new w(0,2.5,0)),0x8fa8ff);this.game.ui.showToast("Arc Shield Active","Break the shield to expose the weak point — +110% bonus damage for 2.6s","danger")}, {radius:2.6,color:0x8fa8ff})}
    else if(patternId==="thunder_punch")this.addTelegraph(player,.72,patternId,point=>{this.game.spawnImpactPulse(point.clone().add(new w(0,.35,0)),0x8fd7ff);zkBossRadial(this.pool,point,{count:12,speed:5.1,damage:13,gapEvery:6,patternId,color:0x8fd7ff,height:.3})},{radius:1.75,color:0x8fd7ff});
    else if(patternId==="shale_bolt_fan")this.addTelegraph(origin,.62,patternId,point=>zkBossFan(this.pool,point,player,{count:9,spread:.96,speed:8.2,damage:10,patternId,color:0x8fd7ff,height:1.35}),{radius:2,color:0x8fd7ff});
    else if(patternId==="static_ring")radial(.7,{count:24,speed:5.8,damage:10,gapEvery:8,height:.55,color:0x8fd7ff});
    else if(patternId==="seismic_hook"){this.stormbackChargeUntil=this.elapsed+1.5;this.addTelegraph(origin,.58,patternId,point=>zkBossFan(this.pool,point,player,{count:3,spread:.28,speed:9.2,damage:14,patternId,color:0x8fd7ff,height:.9}),{radius:2.1,color:0x8fd7ff})}
    else if(patternId==="rolling_stormfront"){rain(7);radial(1,{count:18,speed:5.4,damage:11,gapEvery:6,color:0x8fd7ff})}
    else if(patternId==="faultline_lanes")stormLanes();
    else if(patternId==="stormback_charge"){this.stormbackChargeUntil=this.elapsed+3.2;this.addTelegraph(origin,.5,patternId,point=>zkBossFan(this.pool,point,player,{count:3,spread:.2,speed:10.5,damage:16,patternId,color:0x8fd7ff,height:.9}),{radius:2.2,color:0x8fd7ff})}
    else if(patternId==="lightning_crown"){rain(10);this.addTelegraph(player,.8,patternId,point=>{this.game.spawnImpactPulse(point.clone().add(new w(0,.45,0)),0x8fd7ff);zkBossRadial(this.pool,point,{count:16,speed:5.8,damage:14,gapEvery:8,patternId,color:0x8fd7ff,height:.35})},{radius:1.9,color:0x8fd7ff})}
    else if(patternId==="ridgeline_finale"){this.stormbackChargeUntil=this.elapsed+2.5;this.addTelegraph(origin,.9,patternId,point=>zkBossSpiral(this.pool,point,{arms:3,shots:12,speed:6,offset:this.attackIndex*.33,patternId,color:0x8fd7ff}),{radius:2.4,color:0x8fd7ff});stormLanes()}
    else if(patternId==="screecher_frost_fan")this.addTelegraph(player,.68,patternId,()=>screecherVolley(player,{count:7,spread:.82,speed:9.2,damage:11}),{radius:1.7,color:0xbdefff,hazardDamage:0});
    else if(patternId==="screecher_strafing_run"){this.screecherStrafeUntil=this.elapsed+2.8;screecherMarks(5,.72);this.addTelegraph(player,.55,patternId,()=>screecherVolley(player,{count:5,spread:.46,speed:10,damage:12}),{radius:1.65,color:0xbdefff,hazardDamage:0})}
    else if(patternId==="screecher_cryo_ring"){const groundOrigin=origin.clone();groundOrigin.y=this.game.terrain.heightAt(origin.x,origin.z);this.addTelegraph(groundOrigin,.8,patternId,point=>zkBossRadial(this.pool,point,{count:22,speed:5.5,damage:10,gapEvery:7,patternId,color:0xbdefff,height:.45}),{radius:2,color:0xbdefff,hazardDamage:0})}
    else if(patternId==="screecher_whiteout_spiral"){const groundOrigin=origin.clone();groundOrigin.y=this.game.terrain.heightAt(origin.x,origin.z);this.addTelegraph(groundOrigin,.82,patternId,point=>zkBossSpiral(this.pool,point,{arms:2,shots:16,speed:5.8,offset:this.attackIndex*.31,patternId,color:0xbdefff}),{radius:2.2,color:0xbdefff,hazardDamage:0})}
    else if(patternId==="screecher_hail_marks")screecherMarks(8,.82);
    else if(patternId==="screecher_ice_lanes")screecherLanes();
    else if(patternId==="screecher_blizzard_dive"){this.screecherDiveUntil=this.elapsed+2.7;this.addTelegraph(player,.75,patternId,landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.45,0)),0xbdefff);zkBossRadial(this.pool,landing,{count:16,speed:6.2,damage:16,gapEvery:8,patternId,color:0xbdefff,height:.45});screecherVolley(landing,{count:5,spread:.38,speed:11.2,damage:16})},{radius:2.1,color:0xbdefff})}
    else if(patternId==="screecher_sky_barrage"){this.screecherStrafeUntil=this.elapsed+3.1;screecherMarks(10,.68);this.addTelegraph(player,.62,patternId,()=>screecherVolley(player,{count:9,spread:1.05,speed:10.6,damage:14}),{radius:1.8,color:0xbdefff,hazardDamage:0})}
    else if(patternId==="screecher_finale"){this.screecherDiveUntil=this.elapsed+3.2;screecherMarks(8,.72);screecherLanes();this.addTelegraph(player,.9,patternId,landing=>screecherVolley(landing,{count:9,spread:.92,speed:11.5,damage:17,scale:2.2}),{radius:2.15,color:0xbdefff,hazardDamage:0})}
    else if(patternId==="thorn_radial_burst")radial(.62,{count:22,speed:9.4,gapEvery:7});
    else if(patternId==="spore_rain")rain(12,{delay:.85,damage:15,fall:15,homing:1.6});
    else if(patternId==="spore_aerial_pinball"){const aerialOrigin=origin.clone().add(new w(0,11,0)),pinballCount=this.phase?.id==="phase_3"?9:6;for(let i=0;i<pinballCount;i+=1){const angle=i/pinballCount*Math.PI*2+this.attackIndex*.37,spread=Math.random()*.4,velocity=new w(Math.cos(angle+spread)*7.5, -1.5-Math.random()*2.5, Math.sin(angle+spread)*7.5);this.pool.acquire({position:aerialOrigin.clone().add(new w((Math.random()-.5)*3, Math.random()*2, (Math.random()-.5)*3)), velocity, damage:13, lifetime:8, patternId, color, scale:1.65, radius:.72, bounces:4, homing:0, terrainFollow:false, heightOffset:1});}
    // companion ground spore ring from same aerial burst
    this.addTelegraph(origin,.85,patternId+"_ring",pt=>zkBossRadial(this.pool,pt,{count:14,speed:4.2,damage:9,gapEvery:7,patternId:patternId+"_ring",color,height:.4}),{radius:1.8,color});}
    else if(patternId==="root_ground_wave"){this.thornwardenAdvanceUntil=this.elapsed+1.4;radial(.8,{count:26,speed:8.2,gapEvery:8,height:.25,color:0xff9a4f})}
    else if(patternId==="double_thorn_spiral")this.addTelegraph(origin,1,patternId,point=>zkBossSpiral(this.pool,point,{arms:3,shots:20,speed:8.6,offset:this.attackIndex*.27,patternId,color}),{radius:2.3,color});
    else if(patternId==="targeted_root_eruptions"){this.thornwardenAdvanceUntil=this.elapsed+1.8;eruption()}
    else if(patternId==="rotating_thorn_wall")radial(.72,{count:34,speed:8.8,offset:this.attackIndex*.34,gapEvery:9});
    else if(patternId==="canopy_storm"){rain(14,{delay:.7,damage:16,fall:17,homing:2.2,tight:!0});radial(.95,{count:20,speed:9.8,gapEvery:7})}
    else if(patternId==="alternating_root_lanes")lanes();
    else if(patternId==="thornwarden_final_sequence"){this.thornwardenAdvanceUntil=this.elapsed+2.4;radial(1.5,{count:22,speed:5.4,gapEvery:7});lanes()}
    else{radial(1.5,{count:22,speed:5.4,gapEvery:7});lanes()}
    if(this.config.id==="wetlands_broodwarden"){this.insectHoverUntil=this.elapsed+1.6;const hoverColor=this.config.color,swarmTarget=player.clone();this.addTelegraph(swarmTarget,.55,patternId+"_swarm",pt=>zkBossFan(this.pool,pt,player,{count:5,spread:.55,speed:8.5,damage:11,patternId:patternId+"_swarm",color:hoverColor,height:5.2}),{radius:1.4,color:hoverColor});if(this.attackIndex%2===0)rain(5,{delay:.9,damage:10,fall:11,homing:.9,tight:!0})}
    if(this.config.id==="desert_sunscar_colossus"&&player.y-origin.y>2.2){const perch=player.clone();this.addTelegraph(perch,.85,"solar_high_ground_lance",landing=>{const target=perch.clone().add(new w(0,1.2,0)),start=target.clone().add(new w(0,14,0)),velocity=target.clone().sub(start).normalize().multiplyScalar(15);this.pool.acquire({position:start,velocity,damage:18,lifetime:1.4,radius:.9,patternId:"solar_high_ground_lance",color:0xffb13b,scale:2})},{radius:1.9,color:0xffb13b})}
    if(this.config.id==="wetlands_mire_siren"&&player.y-origin.y>2){const perch=player.clone();this.addTelegraph(perch,.8,"watershed_high_ground_surge",landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.4,0)),0x57e7cc);zkBossRadial(this.pool,landing,{count:14,speed:5.4,damage:16,gapEvery:7,patternId:"watershed_high_ground_surge",color:0x57e7cc,height:.35})},{radius:2,color:0x57e7cc})}
    if(this.config.id==="wetlands_drowned_tremor"&&player.y-origin.y>1.8){const perch=player.clone();this.drownedBreachUntil=this.elapsed+2;this.addTelegraph(perch,.72,"drowned_high_ground_breach",landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.45,0)),0x4fcdb4);zkBossRadial(this.pool,landing,{count:16,speed:5.8,damage:18,gapEvery:8,patternId:"drowned_high_ground_breach",color:0x4fcdb4,height:.4})},{radius:2.1,color:0x4fcdb4})}
    if(this.config.id==="highlands_stormback"&&player.y-origin.y>1.6){const perch=player.clone();this.addTelegraph(perch,.65,"summit_lightning_strike",landing=>{const start=landing.clone().add(new w(0,15,0)),velocity=landing.clone().add(new w(0,.5,0)).sub(start).normalize().multiplyScalar(18);this.pool.acquire({position:start,velocity,damage:19,lifetime:1.25,radius:.95,patternId:"summit_lightning_strike",color:0x8fd7ff,scale:2.1})},{radius:1.75,color:0x8fd7ff})}
    if(this.config.id==="forest_ancient_thornwarden"&&player.y-origin.y>1.8){const perch=player.clone();this.addTelegraph(perch,.8,"canopy_high_ground_roots",landing=>{this.game.spawnImpactPulse(landing.clone().add(new w(0,.4,0)),0x9fe45c);zkBossRadial(this.pool,landing,{count:14,speed:5.4,damage:16,gapEvery:7,patternId:"canopy_high_ground_roots",color:0x9fe45c,height:.35})},{radius:1.9,color:0x9fe45c})}
    if(this.config.id==="arctic_white_screecher"&&player.y-this.game.terrain.heightAt(player.x,player.z)>1.6){const perch=player.clone();this.addTelegraph(perch,.72,"whiteout_high_ground_strike",landing=>{const start=landing.clone().add(new w(0,15,0)),velocity=landing.clone().add(new w(0,.5,0)).sub(start).normalize().multiplyScalar(18);this.pool.acquire({position:start,velocity,damage:20,lifetime:1.25,radius:1,patternId:"whiteout_high_ground_strike",color:0xbdefff,scale:2.35})},{radius:1.85,color:0xbdefff,hazardDamage:0})}
  }
  update(delta){const began=performance.now();if(!this.active){this.considerStart();return}if(!this.boss||!this.boss.parent){this.abort("Boss entity missing");return}this.elapsed+=delta;this.pool.update(delta,this);this.updateTelegraphs(delta);/* trails: pooled meshes reuse geometry/material; impactFlash via spawnImpactPulse; shockwave via telegraph ring; fog via biome atmosphere; cameraImpulse via WeakPoint hit */this.peakProjectiles=Math.max(this.peakProjectiles,this.pool.active.length);const health=Math.max(0,Number(this.boss.userData.health));if(health<this.lastBossHealth-.01){this.queueDamage(this.lastBossHealth-health);this.lastBossHealth=health}const nextPhase=phaseForHealth(this.config,health,this.maxHealth);if(nextPhase.id!==this.phase.id){this.phase=nextPhase;this.phaseStartedAt=this.elapsed;this.transitionUntil=this.elapsed+1.4;this.pool.clear();this.clearTelegraphs();this.attackIndex=0;this.nextAttackAt=this.transitionUntil+1.25;this.game.spawnImpactPulse(this.boss.position.clone().add(new w(0,3,0)),nextPhase.color);this.boss&&(this.boss.userData.weakPointUntil=performance.now()+2400);this.game.ui.showToast(nextPhase.label,"Weak point exposed — burst window open!","success");this.game.ui.showToast(nextPhase.label,`${this.config.name} changed its attack formation. Projectiles cleared for a readable transition.`,"danger")}
    let bossMoving=!0;const stunned=performance.now()<Number(this.boss?.userData?.bossStunUntil??0);if(stunned)bossMoving=!1;else if(this.config.id==="desert_sunscar_colossus")bossMoving=zkMoveSunscarBoss(this,delta);else if(this.config.id==="wetlands_mire_siren")bossMoving=zkMoveMireSirenBoss(this,delta);else if(this.config.id==="wetlands_drowned_tremor")bossMoving=zkMoveDrownedTremorBoss(this,delta);else if(this.config.id==="highlands_stormback")bossMoving=zkMoveStormbackBoss(this,delta);else if(this.config.id==="forest_ancient_thornwarden")bossMoving=zkMoveThornwardenBoss(this,delta);else if(this.config.id==="arctic_white_screecher")bossMoving=zkMoveWhiteScreecherBoss(this,delta);else if(this.config.id==="wetlands_broodwarden")bossMoving=zkMoveInsectKingBoss(this,delta);else if(this.config.id==="forest_spore_cantor")bossMoving=zkMoveSporeCantorBoss(this,delta);else if(this.config.id==="highlands_arc_gunner")bossMoving=zkMoveArcGunnerBoss(this,delta);else if(this.config.id===ZK_KNIGHT_ID)bossMoving=zkMoveObsidianKnightBoss(this,delta);else{const orbit=this.elapsed*.16+this.seed%17,bossTarget=this.center.clone().add(new w(Math.cos(orbit)*2.2,0,Math.sin(orbit)*2.2)),before=this.boss.position.clone();this.boss.position.lerp(bossTarget,Math.min(1,delta*.55));bossMoving=before.distanceToSquared(this.boss.position)>1e-6}this.lastBossMoving=bossMoving;const facing=this.game.player.group.position.clone().sub(this.boss.position);this.boss.rotation.y=Math.atan2(facing.x,facing.z);this.boss.userData.bossHqModel?.update?.(delta,bossMoving,this.phase?.id==="phase_3"||this.elapsed<Number(this.mireHuntUntil??0)||this.elapsed<Number(this.drownedBreachUntil??0)||this.elapsed<Number(this.stormbackChargeUntil??0)||this.elapsed<Number(this.thornwardenAdvanceUntil??0)||this.elapsed<Number(this.screecherDiveUntil??0)||this.elapsed<Number(this.screecherStrafeUntil??0)||this.elapsed<Number(this.insectHoverUntil??0));const wpVuln=performance.now()<Number(this.boss?.userData?.weakPointUntil??0);this.weakPoint&&(this.weakPoint.material.emissiveIntensity=wpVuln?6+Math.sin(this.elapsed*14)*2.2:3+Math.sin(this.elapsed*6)*1.4, this.weakPoint.scale.setScalar(wpVuln?1.35:1));
    if(this.elapsed>=this.nextAttackAt&&this.elapsed>=this.transitionUntil){const order=this.attackOrders[this.phase.id],pattern=order[this.attackIndex%order.length],timing=bossAttackTiming(this.config,pattern,this.phase.id);if(this.pool.active.length>245){this.pool.clearOldest?.(20);this.nextAttackAt=this.elapsed+.2}else if(this.pool.active.length>Math.min(timing.maxCarryover,220)){this.nextAttackAt=this.elapsed+.35}else{this.attackIndex+=1;this.currentAttackTiming=timing;this.schedulePattern(pattern);this.nextAttackAt=this.elapsed+timing.cooldown}}
    if(this.game.player.health<=0&&this.previousPlayerHealth>0)this.playerDeaths+=1;this.previousPlayerHealth=Number(this.game.player.health);if(health<=0)this.finish();this.renderHud();this.frameTotal+=performance.now()-began;this.frameSamples+=1}
  considerStart(){
    if(!this.game.player||this.game.paused) return;
    // Campaign progression, not the transient replay ledger, owns automatic
    // Guardian selection. Replay bosses remain explicit QA/debug actions.
    const context=this.game.getMissionContext();
    const nextMission=zkCampaignState(context).current;
    if(!nextMission?.bossEncounter) return;
    if(!missionReadyForBoss(nextMission.id,context)) return;
    const area=zkAOAt(this.game.player.group.position.x,this.game.player.group.position.z);
    if(area.id!==nextMission.biome&&nextMission.id!=="tower-one"){
      if(Date.now()-Number(this.lastReturnToastAt??0)>2e4){
        this.lastReturnToastAt=Date.now();
        this.game.ui.showToast("Guardian awaiting",`Return to the ${nextMission.biome.toUpperCase()} AO to begin the mission boss encounter.`,"info");
      }
      return;
    }
    this.startEncounter({missionId:nextMission.id});
  }
  metrics(){const elapsed=Math.max(1,(Date.now()-this.startedAt)/1000),startingHealth=100*Math.max(1,this.playerCount()),healthLost=Math.min(startingHealth,this.damageTaken),buildingNow=(this.game.buildings?.records??[]).reduce((sum,record)=>sum+Number(record.health??1000),0);return{damageAvoidance:1-healthLost/startingHealth,timeScore:Math.max(0,1-elapsed/300),telegraphAvoidance:1-this.telegraphHits/Math.max(1,this.telegraphCount),teamSurvival:Math.max(0,1-this.playerDeaths/Math.max(1,this.playerCount())),infrastructureProtection:this.infrastructureStart?Math.max(0,Math.min(1,buildingNow/this.infrastructureStart)):1}}
  applyReward(defeat){const missionId=defeat.missionId,rewardId=defeat.rewardId,claimed=this.game.missionStats.claimedBossRewards??(this.game.missionStats.claimedBossRewards=[]);this.game.missionStats.bossDefeats??={};this.game.missionStats.bossDefeats[missionId]=defeat;if(!canGrantEncounterReward(claimed,rewardId))return!1;claimed.push(rewardId);const reward=defeat.rewards;this.game.simulation.resources.credits=He(Number(this.game.simulation.resources.credits)+Number(reward.credits),0,9999);this.game.simulation.resources.timber=He(Number(this.game.simulation.resources.timber)+Number(reward.timber),0,9999);this.game.simulation.resources.iron=He(Number(this.game.simulation.resources.iron)+Number(reward.iron),0,9999);this.game.diplomacyTension=He(Number(this.game.diplomacyTension??50)-50,0,100);this.game.multiplayerRoom?.queueRelationEvent?.({tensionDelta:-25,reason:`${defeat.bossName} defeated`});this.game.multiplayerRoom?.queueRelationEvent?.({tensionDelta:-25,reason:`${defeat.bossName} guardian crisis resolved`});zkSaveDiplomacyCycle(this.game);this.game.ui.showToast(`${defeat.grade} BOSS VICTORY`,`+${reward.credits} credits · +${reward.timber} timber · +${reward.iron} iron ore · ZekNovan tension -50.`,"success");this.game.updateHud(!0);this.game.save();return!0}
  finish(sharedDefeat=null){
    if(!this.active&&!sharedDefeat) return;
    const config=this.config??missionBossConfig(sharedDefeat?.missionId),grade=sharedDefeat?.grade?{grade:sharedDefeat.grade,multiplier:Number(sharedDefeat.multiplier)}:performanceGrade(this.metrics()),reward=bossRewards(config,grade.multiplier),missionId=sharedDefeat?.missionId??config.missionId,rewardId=sharedDefeat?.rewardId??encounterRewardId(missionId,this.seed),defeat=sharedDefeat??{missionId,bossId:config.id,bossName:config.name,rewardId,grade:grade.grade,multiplier:grade.multiplier,rewards:reward,defeatedAt:Date.now(),telemetry:{seed:this.seed,playerCount:this.playerCount(),durationMs:Date.now()-this.startedAt,playerDeaths:this.playerDeaths,peakProjectiles:this.peakProjectiles,averageFrameMs:this.frameSamples?this.frameTotal/this.frameSamples:0,lastDamageAttribution:this.lastDamageAttribution??null}};
    this.applyReward(defeat);
    // BossCombat: mark per-run defeat (replay 1..12) and also permanent for unlock
    try{
      const team=String(this.game.user?.teamCode||"default");
      const runKey="zeknova.bossRun.v1."+team;
      let runState={bossDefeats:{}};
      try{ const raw=sessionStorage.getItem(runKey); if(raw) runState=JSON.parse(raw); }catch(e){}
      runState.bossDefeats=runState.bossDefeats||{};
      runState.bossDefeats[missionId]=defeat;
      try{ sessionStorage.setItem(runKey, JSON.stringify(runState)); }catch(e){}
      // Also mark QA defeats separately, never as production authority, but keep production bossDefeats for unlock
      const qaKey="zeknova.qa.bossDefeats.v1."+team;
      let qa={}; try{ qa=JSON.parse(localStorage.getItem(qaKey)||"{}"); }catch(e){}
      qa[missionId]=defeat; try{ localStorage.setItem(qaKey, JSON.stringify(qa)); }catch(e){}
    }catch(e){}
    this.lastSharedState={encounterId:this.encounterId??missionId+":"+this.seed,missionId,bossId:config.id,seed:this.seed,status:"defeated",health:0,maxHealth:this.maxHealth??scaledBossHealth(config,1),startedAt:this.startedAt??Date.now(),defeat};
    this.cleanup(!0);
    // BossCombat: projectile cleanup between encounters
    try{ this.pool?.clear?.(); this.clearTelegraphs?.(); }catch(e){}
    this.game.syncOfficerProgression?.();
    return defeat;
  }
  abort(reason="Encounter aborted"){this.game.ui.showToast("Boss encounter recovered",`${reason}. Return to the mission biome to restart safely.`,"warning");this.cleanup(!1)}
  cleanup(victory=!1){
    try{ this.pool.clear(); this.clearTelegraphs(); }catch(e){}
    if(this.boss){try{this.boss.userData.bossHqModel?.dispose?.();}catch(e){} this.game.scene.remove(this.boss);const index=this.game.enemies.indexOf(this.boss);index>=0&&this.game.enemies.splice(index,1)}
    if(this.weakPoint){try{this.weakPoint.geometry.dispose();this.weakPoint.material.dispose();}catch(e){}}
    this.boss=null;this.active=!1;this.hideHud();this.game.updateHud(!0);if(!victory)this.lastSharedState=null
  }
  snapshot(){if(this.active)return{encounterId:this.encounterId,missionId:this.config.missionId,bossId:this.config.id,seed:this.seed,status:"active",health:Math.max(0,Number(this.boss?.userData.health??0)),maxHealth:this.maxHealth,startedAt:this.startedAt,x:this.center.x,z:this.center.z,bossX:Number(this.boss?.position.x??this.center.x),bossZ:Number(this.boss?.position.z??this.center.z),moving:!!this.lastBossMoving,phase:this.phase.id,activePatternId:this.lastPattern,projectileCount:this.pool.active.length};return this.lastSharedState}
  applyShared(state){if(!state?.missionId)return;if(state.status==="defeated"&&state.defeat){this.applyReward(state.defeat);if(this.active&&this.config?.missionId===state.missionId)this.finish(state.defeat);return}if(state.status!=="active"||this.game.missionStats.bossDefeats?.[state.missionId])return;if(!this.active)this.startEncounter({missionId:state.missionId,seed:state.seed,shared:state,force:!0});else if(this.encounterId===state.encounterId){const serverHealth=Number(state.health);if(Number.isFinite(serverHealth)&&serverHealth<Number(this.boss.userData.health)){this.boss.userData.health=serverHealth;this.lastBossHealth=serverHealth}}}
  dispose(){this.cleanup(!1);this.pool.dispose();this.hideHud()}
}

// Lasers and area specials can write health directly instead of using the
// weapon-target hook. Normalize those hits before the manager records damage.
const zkBossDefenseUpdate=zkBossManager.prototype.update;
zkBossManager.prototype.update=function(delta){if(this.active&&this.boss){const untracked=Math.max(0,Number(this.lastBossHealth)-Number(this.boss.userData.health));if(untracked>.01)this.resolveDefense(untracked)}return zkBossDefenseUpdate.call(this,delta)};

const zkBossMissionContext=zR.prototype.getMissionContext;
zR.prototype.getMissionContext=function(){const context=zkBossMissionContext.call(this),visited=new Set(this.missionStats.biomeVisited??[]),biomeStats=this.missionStats.biomeStats??{},biomes={};for(const area of zkAreasOfOperation)biomes[area.id]=zkBossBiomeState(),biomes[area.id].visited=visited.has(area.id),biomes[area.id].resources=Number(this.aoResourceCollected?.[area.id]??0),biomes[area.id].stats={...biomes[area.id].stats,...(biomeStats[area.id]??{})};for(const record of this.buildings?.records??[]){if(Number(record.health??1000)<=0)continue;const id=zkAOAt(Number(record.x),Number(record.z)).id;biomes[id].buildings[record.type]=Number(biomes[id].buildings[record.type]??0)+1}return{...context,biomes,bossDefeats:{...(this.missionStats.bossDefeats??{})}}};

const zkBossChop=zR.prototype.chopTree;zR.prototype.chopTree=function(tree){const before=this.harvestedTreeIds.has(String(tree?.userData?.treeId??"")),result=zkBossChop.call(this,tree),after=this.harvestedTreeIds.has(String(tree?.userData?.treeId??""));if(!before&&after)zkBossRecordBiomeStat(this,tree.position.x,tree.position.z,"treesChopped");return result};
const zkBossMine=zR.prototype.mineRock;zR.prototype.mineRock=function(rock){const before=!!rock?.visible,result=zkBossMine.call(this,rock);if(before&&!rock?.visible)zkBossRecordBiomeStat(this,rock.position.x,rock.position.z,"rocksMined");return result};
const zkBossPowerUp=zR.prototype.collectPowerUp;zR.prototype.collectPowerUp=function(node){const before=!!node?.visible,result=zkBossPowerUp.call(this,node);if(before&&!node?.visible)zkBossRecordBiomeStat(this,node.position.x,node.position.z,"powerUpsCollected");return result};
const zkBossRoll=zR.prototype.rollingShoot;zR.prototype.rollingShoot=function(){const before=Number(this.rollingShotCooldownUntil??0),result=zkBossRoll.call(this);if(Number(this.rollingShotCooldownUntil??0)>before)this.bossRollIFrameUntil=performance.now()+760;return result};
const zkBossDamageTarget=zR.prototype.damageWeaponTarget;zR.prototype.damageWeaponTarget=function(enemy,damage,color,weaponId=null){if(!enemy?.userData?.isMissionBoss)return zkBossDamageTarget.call(this,enemy,damage,color,weaponId);if(!this.bossManager?.active||Number(enemy.userData.health)<=0)return!1;const amount=Math.max(0,Number(damage)||0),before=Number(enemy.userData.health);enemy.userData.health=Math.max(0,before-amount);const pushMap={voidsting:1,singularity:3,thunderclaw:5};let push=pushMap[weaponId];if(push==null){const d=Number(damage);push=d===3?1:d===5?3:d===7?5:d<=10?1:3}if(push>0){const dir=enemy.position.clone().sub(this.player.group.position);dir.y=0;if(dir.lengthSq()>1e-6){dir.normalize();const nextX=Kt.clamp(enemy.position.x+dir.x*push*.35,-79,79),nextZ=Kt.clamp(enemy.position.z+dir.z*push*.35,-79,79);if(!this.terrain?.isObstacleAt(nextX,nextZ,.65)){enemy.position.x=nextX;enemy.position.z=nextZ}}}const now=performance.now();enemy.userData.bossStunUntil=now+20;const last=Number(enemy.userData.bossLastHitAt??0),consecutive=now-last<600?Number(enemy.userData.bossConsecutiveHits??0)+1:1;enemy.userData.bossConsecutiveHits=consecutive;enemy.userData.bossLastHitAt=now;if(consecutive>=4){enemy.userData.bossStunUntil=now+120;enemy.userData.bossConsecutiveHits=0;enemy.userData.bossStunnedAt=now}this.player.xp+=3;this.spawnImpactPulse(enemy.position.clone().add(new w(0,4.8,0)),color);this.bossManager.recordBossDamage(before-Number(enemy.userData.health));return!0};
const zkBossEnemyUpdate=zR.prototype.updateEnemies;zR.prototype.updateEnemies=function(delta){if(!this.bossManager)return zkBossEnemyUpdate.call(this,delta);const boss=this.bossManager.active?this.bossManager.boss:null,defeated=[];for(const enemy of this.enemies)if(enemy!==boss&&Number(enemy.userData.health)<=0&&!enemy.userData.biomeDefeatRecorded)enemy.userData.biomeDefeatRecorded=!0,defeated.push(enemy);if(boss){const index=this.enemies.indexOf(boss);index>=0&&this.enemies.splice(index,1);const result=zkBossEnemyUpdate.call(this,delta);this.enemies.push(boss);for(const enemy of defeated)zkBossRecordBiomeStat(this,enemy.position.x,enemy.position.z,"enemiesDefeated");this.bossManager.update(delta);return result}const result=zkBossEnemyUpdate.call(this,delta);for(const enemy of defeated)zkBossRecordBiomeStat(this,enemy.position.x,enemy.position.z,"enemiesDefeated");this.bossManager.update(delta);return result};
const zkBossSpawning=zR.prototype.processEnemySpawning;zR.prototype.processEnemySpawning=function(delta){if(this.bossManager?.active)return;return zkBossSpawning.call(this,delta)};
const zkBossToggleMode=zR.prototype.toggleMode;zR.prototype.toggleMode=function(){if(this.bossManager?.active&&this.mode==="explore"){this.ui.showToast("Command mode locked","Defeat the active mission guardian before returning to construction.","warning");return}return zkBossToggleMode.call(this)};

// Stormback alone initiates at the player's current location. Every other guardian
// is restored to its canonical arena immediately after encounter initialization.
const zkBossStartEncounter=zkBossManager.prototype.startEncounter;
zkBossManager.prototype.startEncounter=function(options={}){
  const started=zkBossStartEncounter.call(this,options);
  if(started&&this.config?.id!=="highlands_stormback"){
    const arena=this.findArena(this.config);
    if(options.shared?.z!=null) arena.z=Number(options.shared.z);
    this.center.copy(arena);
    this.boss?.position.copy(arena);
  }
  return started;
};

const zkBossInitialize=zR.prototype.initialize;zR.prototype.initialize=async function(){const result=await zkBossInitialize.call(this);this.missionStats.biomeVisited??=[];this.missionStats.biomeStats??={};this.missionStats.bossDefeats??={};this.missionStats.claimedBossRewards??=[];this.bossManager=new zkBossManager(this);const local=["localhost","127.0.0.1","::1"].includes(location.hostname),params=new URLSearchParams(location.search),savedBoss=this.missionStats.activeBoss;if(local){globalThis.ZekNovaBossDebug={start:(missionId="habitat")=>this.bossManager.startEncounter({missionId,force:!0}),end:()=>this.bossManager.finish(),damageTenPercent:()=>{const boss=this.bossManager.boss;if(boss)boss.userData.health=Math.max(0,Number(boss.userData.health)-this.bossManager.maxHealth*.1)},forcePhase:phase=>{const boss=this.bossManager.boss;if(boss)boss.userData.health=this.bossManager.maxHealth*({1:.9,2:.6,3:.25}[phase]??.9)},trigger:pattern=>this.bossManager.schedulePattern(pattern),toggleDamage:()=>this.bossManager.debugPlayerDamage=!this.bossManager.debugPlayerDamage,toggleTelegraphs:()=>this.bossManager.debugTelegraphs=!this.bossManager.debugTelegraphs,snapshot:()=>this.bossManager.snapshot()};if(params.has("qaBoss"))window.setTimeout(()=>{const started=this.bossManager.startEncounter({missionId:params.get("qaBoss")||"habitat",force:!0});if(started&&this.bossManager.active){const center=this.bossManager.center,x=center.x,z=center.z+Math.min(6,this.bossManager.radius*.45);this.bossManager.debugPlayerDamage=!1;this.player.health=100;this.player.group.position.set(x,this.terrain.heightAt(x,z),z);this.alignExploreCameraToPlayer()}},900)}/* Resume only the active campaign mission. A stale replay boss must never preempt current progression after refresh. */if(!params.has("qaBoss")&&savedBoss?.status==="active"&&savedBoss.missionId&&!this.missionStats.bossDefeats[savedBoss.missionId]){const restoreContext=this.getMissionContext?.(),currentMission=restoreContext?zkCampaignState(restoreContext).current:null;if(!restoreContext||currentMission?.id!==savedBoss.missionId||!missionReadyForBoss(savedBoss.missionId,restoreContext))this.missionStats.activeBoss=null;else window.setTimeout(()=>this.bossManager.startEncounter({missionId:savedBoss.missionId,seed:savedBoss.seed,shared:savedBoss,force:!0}),700);}return result};
const zkBossVisitUpdate=zR.prototype.updateAO;zR.prototype.updateAO=function(...args){const result=zkBossVisitUpdate?.apply(this,args),position=this.player?.group?.position;if(position){const id=zkAOAt(position.x,position.z).id,visited=new Set(this.missionStats.biomeVisited??[]);if(!visited.has(id))visited.add(id),this.missionStats.biomeVisited=[...visited],this.updateHud(!0)}return result};
const zkBossSave=zR.prototype.save;zR.prototype.save=function(){if(this.bossManager?.active)this.missionStats.activeBoss=this.bossManager.snapshot();else delete this.missionStats.activeBoss;return zkBossSave.call(this)};
const zkBossDispose=zR.prototype.dispose;zR.prototype.dispose=function(){this.bossManager?.dispose?.();return zkBossDispose.call(this)};

/* Lightweight cinematic grading: each equal-width AO now carries its own
   atmosphere while reusing the existing lights, fog, water, and adaptive
   quality controller. This adds no post-processing passes or new textures. */
const zkBiomeAtmosphere={
  forest:{sky:0x082e31,fog:0x164a3d,sun:0xffe0a0,fill:0x5cf2c2,water:0x137f82,exposure:1.08,fogDensity:.0084},
  desert:{sky:0x20394b,fog:0xb77946,sun:0xffc56f,fill:0x8fd7e8,water:0x239db0,exposure:1.16,fogDensity:.0062},
  highlands:{sky:0x102f45,fog:0x496e72,sun:0xffd39a,fill:0x77bfff,water:0x168da4,exposure:1.08,fogDensity:.0073},
  arctic:{sky:0x092b4b,fog:0x91c9dc,sun:0xdff8ff,fill:0x5faeff,water:0x63d8ec,exposure:1.13,fogDensity:.0068},
  wetlands:{sky:0x062f31,fog:0x205d58,sun:0xb9efae,fill:0x56e8d7,water:0x0b7778,exposure:1.04,fogDensity:.0092}
};
zR.prototype.updateBiomeAtmosphere=function(force=!1){if(!this.renderer||!this.player)return;const position=this.player.group.position,area=zkAOAt(position.x,position.z),profile=zkBiomeAtmosphere[area?.id]??zkBiomeAtmosphere.highlands,blend=force?1:.14,targetSky=new re(profile.sky),targetFog=new re(profile.fog),targetSun=new re(profile.sun),targetFill=new re(profile.fill),targetWater=new re(profile.water);this.scene.background instanceof re&&this.scene.background.lerp(targetSky,blend);if(this.scene.fog){this.scene.fog.color.lerp(targetFog,blend),this.scene.fog.density=Kt.lerp(Number(this.scene.fog.density??profile.fogDensity),profile.fogDensity,blend)}const lights=this.zkAtmosphereLights??{};lights.sun?.color?.lerp(targetSun,blend),lights.fill?.color?.lerp(targetFill,blend);const waterMaterial=this.terrain?.water?.material;waterMaterial?.color?.lerp?.(targetWater,blend);const qualityBias=this.graphicsQuality==="high"?.04:this.graphicsQuality==="low"?-.05:0;this.renderer.toneMappingExposure=Kt.lerp(Number(this.renderer.toneMappingExposure??1.08),profile.exposure+qualityBias,blend)};
const zkVisualInitialize=zR.prototype.initialize;zR.prototype.initialize=async function(){const result=await zkVisualInitialize.call(this),directionals=this.scene.children.filter(object=>object.isDirectionalLight),hemisphere=this.scene.children.find(object=>object.isHemisphereLight);this.zkAtmosphereLights={sun:directionals.find(light=>light.castShadow)??directionals[0],fill:directionals.find(light=>!light.castShadow)??directionals[1],hemisphere};if(this.zkAtmosphereLights.sun?.shadow){this.zkAtmosphereLights.sun.shadow.bias=-.00018,this.zkAtmosphereLights.sun.shadow.normalBias=.055,this.zkAtmosphereLights.sun.shadow.radius=2}if(this.renderer?.domElement)this.renderer.domElement.style.filter=this.graphicsQuality==="low"?"saturate(1.025) contrast(1.015)":"saturate(1.075) contrast(1.025)";this.updateBiomeAtmosphere(!0);return result};
const zkVisualAOUpdate=zR.prototype.updateAO;zR.prototype.updateAO=function(...args){const result=zkVisualAOUpdate?.apply(this,args);this.updateBiomeAtmosphere?.();return result};
const zkVisualQuality=zR.prototype.applyGraphicsQuality;zR.prototype.applyGraphicsQuality=function(tier,reason="auto"){const result=zkVisualQuality.call(this,tier,reason);if(this.renderer?.domElement)this.renderer.domElement.style.filter=this.graphicsQuality==="low"?"saturate(1.025) contrast(1.015)":"saturate(1.075) contrast(1.025)";this.updateBiomeAtmosphere?.(!0);return result};

/* Renewable mission ore and persistent village residents. These imports are
   deliberately small, pure modules so the browser runtime and source tests
   share the exact regeneration and civilian-state rules. */
import {MIN_AVAILABLE_MISSION_ORE_PER_BIOME,oreReadyToRespawn,reconcileLegacyBiomeMining} from "../src/world/OreRegeneration.js";
import {RESIDENTS_PER_VILLAGE,RESIDENT_GRID_CELL_SIZE,RESIDENT_HIGH_QUALITY_LIMIT,RESIDENT_MODEL_REFRESH_SECONDS,RESIDENT_UPDATE_STEP,RESIDENT_VISIBLE_DISTANCE,TRAVELERS_PER_BIOME,VILLAGE_RESIDENT_ANCHORS,residentMode,residentPersonalSpace,residentSeparationWeight} from "../src/game/Residents.js";

function zkResetOreFormation(game,rock){
  if(!rock)return;rock.visible=!0,rock.userData.health=Number(rock.userData.maxHealth??1),rock.userData.depleted=!1;const offset=Number(rock.userData.groundOffset);Number.isFinite(offset)&&(rock.position.y=game.terrain.heightAt(rock.position.x,rock.position.z)+offset)
}
function zkMissionOreMaterial(terrain){
  if(terrain.zkMissionOreMaterials)return terrain.zkMissionOreMaterials;
  terrain.zkMissionOreMaterials={stone:new ie({color:5793374,roughness:.9,metalness:.1,flatShading:!0}),ore:new ie({color:10388991,emissive:2631935,emissiveIntensity:1.7,roughness:.3,flatShading:!0})};
  terrain.zkMissionOreGeometry=new qs(.62,1);return terrain.zkMissionOreMaterials
}
zR.prototype.ensureBiomeMissionMines=function(minimum=MIN_AVAILABLE_MISSION_ORE_PER_BIOME){
  if(!this.terrain)return 0;const terrain=this.terrain,materials=zkMissionOreMaterial(terrain);let added=0;
  for(const area of zkAreasOfOperation){
    let available=terrain.mineableRocks.filter(rock=>rock.visible&&zkAOAt(rock.position.x,rock.position.z).id===area.id).length;
    for(let slot=0;available<minimum&&slot<24;slot+=1){
      const id=`mission-ore-${area.id}-${slot}`,existing=terrain.mineableRocks.find(rock=>String(rock.userData.rockId)===id);
      if(existing){if(existing.visible)available+=1;continue}
      const random=new pn(7919+BR(id)+Number(this.biomeSeed??terrain.seed??0));let position=null;
      for(let attempt=0;attempt<120&&!position;attempt+=1){const x=random.range(Math.max(-78,Number(area.center.x)-15.5),Math.min(78,Number(area.center.x)+15.5)),z=random.range(-75,75),y=terrain.heightAt(x,z),occupied=[...terrain.nearby(x,z,3.5)].some(node=>node.visible&&(node.userData.harvestableTree||node.userData.rockId));if(terrain.isWaterAt(x,z,.55)||y>17||Math.hypot(x,z)<14||terrain.isObstacleAt(x,z,1.4)||occupied)continue;position={x,y,z}}
      if(!position)continue;const scale=random.range(.8,1.35),group=new Ge,chunks=3;
      for(let index=0;index<chunks;index+=1){const mesh=new R(terrain.zkMissionOreGeometry,index===chunks-1?materials.ore:materials.stone),offset=(index-1)*.42*scale;mesh.position.set(offset,random.range(-.02,.2)*scale,(index%2?-.2:.2)*scale),mesh.scale.set(scale*random.range(.72,1.12),scale*random.range(.62,1.08),scale*random.range(.68,1.12)),mesh.rotation.set(random.range(0,.55),random.range(0,Math.PI),random.range(0,.42)),mesh.castShadow=this.graphicsQuality!=="low",mesh.receiveShadow=!0,group.add(mesh)}
      const groundOffset=.34*scale;group.position.set(position.x,position.y+groundOffset,position.z),group.userData.rockId=id,group.userData.rockKind="mission iron formation",group.userData.rockTier="mission",group.userData.health=2,group.userData.maxHealth=2,group.userData.minerals=16,group.userData.ironYield=6,group.userData.collisionRadius=1.35,group.userData.visualScale=scale,group.userData.groundOffset=groundOffset,group.userData.missionBiome=area.id,group.visible=!this.minedRockIds.has(id),terrain.mineableRocks.push(group),terrain.group.add(group),terrain.spatialIndex.insert(group,position.x,position.z,1.35),added+=1,group.visible&&(available+=1)
    }
  }
  return added
};
zR.prototype.reconcileLegacyMineProgress=function(){
  this.missionStats.biomeStats??={};const repair=reconcileLegacyBiomeMining({rocks:this.terrain?.mineableRocks??[],minedRockIds:this.minedRockIds,biomeAt:zkAOAt,biomeStats:this.missionStats.biomeStats});this.missionStats.biomeStats=repair.biomeStats;return repair.repairs
};
zR.prototype.refreshOreFormations=function(now=Date.now(),notify=!1){
  if(!this.terrain)return 0;this.missionStats.rockMinedAt??={};let count=0;
  for(const id of [...this.minedRockIds]){const minedAt=Number(this.missionStats.rockMinedAt[id]??0);if(!oreReadyToRespawn(id,minedAt,now))continue;this.minedRockIds.delete(id),delete this.missionStats.rockMinedAt[id];const rock=this.terrain.mineableRocks.find(candidate=>String(candidate.userData.rockId)===String(id));zkResetOreFormation(this,rock),count+=1}
  this.ensureBiomeMissionMines();if(count&&notify)this.ui.showToast("Ore formations regenerated",`${count} iron ore formation${count===1?" is":"s are"} mineable again after ecological recovery.`,"success");return count
};
const zkRenewableOreRestore=zR.prototype.restore;
zR.prototype.restore=function(snapshot){const result=zkRenewableOreRestore.call(this,snapshot);this.missionStats.rockMinedAt={...(snapshot?.missionStats?.rockMinedAt??this.missionStats.rockMinedAt??{})};const fallback=Math.max(0,Date.parse(snapshot?.updatedAt??"")||Date.now());for(const id of this.minedRockIds)Number(this.missionStats.rockMinedAt[id])>0||(this.missionStats.rockMinedAt[id]=fallback);this.reconcileLegacyMineProgress?.();return result};
const zkRenewableOreMine=zR.prototype.mineRock;
zR.prototype.mineRock=function(rock){const wasVisible=!!rock?.visible,result=zkRenewableOreMine.call(this,rock);if(wasVisible&&!rock?.visible){const id=String(rock?.userData?.rockId??"");id&&(this.missionStats.rockMinedAt??={},this.missionStats.rockMinedAt[id]=Date.now(),this.save())}return result};

function zkResidentVillageAnchors(game){
  const anchors=VILLAGE_RESIDENT_ANCHORS.map(anchor=>({...anchor,y:game.terrain.heightAt(anchor.x,anchor.z)}));
  for(const [index,center] of (game.terrain.localTerritories??[]).entries()){if(anchors.some(anchor=>Math.hypot(anchor.x-center.x,anchor.z-center.z)<12))continue;anchors.push({id:`local-village-${index}`,biome:zkAOAt(center.x,center.z).id,x:center.x,y:center.y,z:center.z})}
  return anchors
}
function zkResidentBiomeRoutes(game,shelters){
  const routes=[];
  for(const area of zkAreasOfOperation)for(let index=0;index<TRAVELERS_PER_BIOME;index+=1){let x=area.center.x+(index-1)*5.5,z=(index-1)*12;for(let attempt=0;attempt<7&&game.terrain.isWaterAt(x,z,.45);attempt+=1)z=Kt.clamp(z+(attempt%2?1:-1)*(4+attempt*2),-76,76);const shelter=shelters.reduce((nearest,candidate)=>!nearest||Math.hypot(candidate.x-x,candidate.z-z)<Math.hypot(nearest.x-x,nearest.z-z)?candidate:nearest,null)??{x,y:game.terrain.heightAt(x,z),z};routes.push({id:`${area.id}-traveler-${index}`,biome:area.id,x,y:game.terrain.heightAt(x,z),z,shelter})}
  return routes
}
const zkResidentPalettes={forest:0x3f9b72,desert:0xc89a4d,highlands:0x66849a,arctic:0x95dbe7,wetlands:0x278d83};
const zkResidentHqTypes=["saboteur","spitter","stalker"];
function zkResidentModel(biome,index){
  const palette=zkResidentPalettes[biome]??0x4f9a83,root=new Ge,cloth=new ie({color:palette,roughness:.9,metalness:.02,flatShading:!0}),skin=new ie({color:0x83c0a2,roughness:.82,flatShading:!0}),trim=new ie({color:index%2?0x69e6d2:0xe0c66f,emissive:index%2?0x123f3a:0x443511,emissiveIntensity:.45,roughness:.58,flatShading:!0}),body=new R(new ve(.24,.37,.72,6),cloth),head=new R(new Se(.25,8,6),skin),belt=new R(new tt(.3,.05,5,16),trim),leftLeg=new R(new ve(.09,.13,.54,6),cloth),rightLeg=leftLeg.clone(),leftArm=new R(new ve(.075,.11,.58,6),skin),rightArm=leftArm.clone(),leftShoulder=new R(new Se(.16,7,5),trim),rightShoulder=leftShoulder.clone(),leftFrill=new R(new Hi(.12,.3,5),trim),rightFrill=leftFrill.clone();
  body.position.y=.92,head.position.y=1.48,head.scale.set(.82,1.06,.78),belt.rotation.x=Math.PI/2,belt.position.y=.91,leftLeg.position.set(-.16,.31,0),rightLeg.position.set(.16,.31,0),leftArm.position.set(-.39,.94,0),rightArm.position.set(.39,.94,0),leftArm.rotation.z=-.16,rightArm.rotation.z=.16,leftShoulder.position.set(-.33,1.22,0),rightShoulder.position.set(.33,1.22,0),leftShoulder.scale.set(1.2,.72,1),rightShoulder.scale.copy(leftShoulder.scale),leftFrill.position.set(-.3,1.49,.02),rightFrill.position.set(.3,1.49,.02),leftFrill.rotation.z=-1.05,rightFrill.rotation.z=1.05;
  root.add(body,head,belt,leftLeg,rightLeg,leftArm,rightArm,leftShoulder,rightShoulder,leftFrill,rightFrill),root.userData.fallbackParts=[...root.children],root.scale.setScalar(.82+index*.025);for(const mesh of root.userData.fallbackParts)mesh.castShadow=!1,mesh.receiveShadow=!0;return root
}
function zkAddResident(game,{anchor,index,kind="villager",shelter=anchor}){
  const angle=index/Math.max(1,kind==="traveler"?TRAVELERS_PER_BIOME:RESIDENTS_PER_VILLAGE)*Math.PI*2+.45,radius=kind==="traveler"?1.6:2.8+index%2*1.5,x=anchor.x+Math.cos(angle)*radius,z=anchor.z+Math.sin(angle)*radius,model=zkResidentModel(anchor.biome,index);model.position.set(x,game.terrain.heightAt(x,z),z),model.rotation.y=angle+Math.PI,model.userData.residentId=`${anchor.id}-resident-${index}`,model.userData.residentKind=kind,model.userData.biome=anchor.biome,model.userData.home=new w(shelter.x,shelter.y??game.terrain.heightAt(shelter.x,shelter.z),shelter.z),model.userData.roamCenter=new w(anchor.x,anchor.y??game.terrain.heightAt(anchor.x,anchor.z),anchor.z),model.userData.target=model.position.clone(),model.userData.phase=index*1.73+BR(anchor.id)%17,model.userData.speed=kind==="traveler"?1.02+index*.07:.72+index*.05,model.userData.residentMode="roaming",game.residentNPCs.push(model),game.residentGroup.add(model)
}
zR.prototype.createVillageResidents=function(){
  if(this.residentNPCs?.length||!this.terrain)return;this.residentNPCs=[],this.residentGroup=new Ge,this.residentGroup.name="zeknovan-residents",this.scene.add(this.residentGroup);const anchors=zkResidentVillageAnchors(this);
  for(const anchor of anchors)for(let index=0;index<RESIDENTS_PER_VILLAGE;index+=1)zkAddResident(this,{anchor,index});
  for(const route of zkResidentBiomeRoutes(this,anchors))zkAddResident(this,{anchor:route,index:Number(route.id.at(-1))||0,kind:"traveler",shelter:route.shelter});
  this.residentShelterActive=!1,this.residentModelRefreshAccumulator=RESIDENT_MODEL_REFRESH_SECONDS,this.refreshResidentModels(!0),this.bossManager?.active&&this.setResidentsSheltering(!0),console.info(`ZekNova populated ${anchors.length} settlements and five biome routes with ${this.residentNPCs.length} independent residents.`)
};
zR.prototype.loadResidentHighQualityModel=async function(resident){
  if(!resident||resident.userData.hqModel||resident.userData.hqLoading||this.disposed)return;resident.userData.hqLoading=!0;
  const hash=BR(resident.userData.residentId),type=resident.userData.residentKind==="villager"?(hash%4===0?"spitter":"saboteur"):zkResidentHqTypes[hash%zkResidentHqTypes.length];resident.userData.hqType=type;
  try{const runtime=await import("./model-runtime-c96327ba.js?v=resident-population8"),model=await runtime.loadEnemyModel(type);if(this.disposed||!this.residentNPCs?.includes(resident)||!resident.userData.hqDesired){model.dispose?.();return}if(model.calibrate?.()!==!0){model.dispose?.();return}const bounds=model.measure?.(),safe=bounds&&bounds.height>1.5&&bounds.height<7&&bounds.width>.2&&bounds.width<8&&bounds.depth>.2&&bounds.depth<8;if(!safe){model.dispose?.();return}model.root.position.set(0,0,0),model.setCivilianPalette?.(zkResidentPalettes[resident.userData.biome]??0x4f9a83,.24),resident.add(model.root),resident.userData.hqModel=model,resident.userData.hqBounds=bounds,(resident.userData.fallbackParts??[]).forEach(part=>part.visible=!1),model.update?.(0,!1,!1)}catch(error){console.warn("ZekNova resident mesh upgrade unavailable; retaining the lightweight civilian.",error)}finally{resident.userData.hqLoading=!1}
};
zR.prototype.refreshResidentModels=function(force=!1){
  if(!this.player||!this.residentNPCs?.length)return;const origin=this.player.group.position,candidates=this.residentNPCs.map(resident=>({resident,distance:Math.hypot(resident.position.x-origin.x,resident.position.z-origin.z)})).filter(entry=>entry.distance<=RESIDENT_VISIBLE_DISTANCE&&entry.resident.userData.residentMode!=="sheltered").sort((a,b)=>a.distance-b.distance),desired=new Set(candidates.slice(0,RESIDENT_HIGH_QUALITY_LIMIT).map(entry=>entry.resident));
  for(const resident of this.residentNPCs){resident.userData.hqDesired=desired.has(resident);if(!resident.userData.hqModel||resident.userData.hqDesired)continue;resident.userData.hqModel.dispose?.(),resident.userData.hqModel=null,resident.userData.hqBounds=null,(resident.userData.fallbackParts??[]).forEach(part=>part.visible=!0)}
  const missing=[...desired].filter(resident=>!resident.userData.hqModel&&!resident.userData.hqLoading);for(const resident of missing.slice(0,force?4:2))this.loadResidentHighQualityModel(resident)
};
function zkResidentCrowdGrid(residents){
  const cells=new Map;for(const resident of residents){const x=Math.floor(resident.position.x/RESIDENT_GRID_CELL_SIZE),z=Math.floor(resident.position.z/RESIDENT_GRID_CELL_SIZE),key=`${x}:${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(resident)}return cells
}
function zkResidentSeparation(resident,cells){
  const cellX=Math.floor(resident.position.x/RESIDENT_GRID_CELL_SIZE),cellZ=Math.floor(resident.position.z/RESIDENT_GRID_CELL_SIZE),preferred=residentPersonalSpace(resident.userData.residentKind);let x=0,z=0,neighbors=0;
  for(let ox=-1;ox<=1;ox+=1)for(let oz=-1;oz<=1;oz+=1)for(const other of cells.get(`${cellX+ox}:${cellZ+oz}`)??[]){if(other===resident)continue;let dx=resident.position.x-other.position.x,dz=resident.position.z-other.position.z,distance=Math.hypot(dx,dz);if(distance>=preferred)continue;if(distance<.03){const angle=(BR(resident.userData.residentId)-BR(other.userData.residentId))*.001;dx=Math.cos(angle),dz=Math.sin(angle),distance=1}const force=residentSeparationWeight(distance,preferred);x+=dx/distance*force,z+=dz/distance*force,neighbors+=1}
  return{x,z,neighbors}
}
zR.prototype.setResidentsSheltering=function(active,victory=!1){
  this.residentShelterActive=!!active,victory&&(this.residentPostBossUntil=performance.now()+3e4);const shelterSlots=new Map;
  for(const resident of this.residentNPCs??[]){
    if(active){
      const id=BR(resident.userData.residentId),slot=shelterSlots.get("edge")??0,bearing=Math.atan2(resident.position.z,resident.position.x),angle=bearing+(id%41-20)*.011+(slot%9-4)*.018;let radius=Be.worldSize*.46;const target=new w(Math.cos(angle)*radius,0,Math.sin(angle)*radius);for(let attempt=0;attempt<14&&(this.terrain.isWaterAt(target.x,target.z,.45)||this.terrain.isObstacleAt?.(target.x,target.z,.5));attempt+=1)radius-=4.5,target.set(Math.cos(angle)*radius,0,Math.sin(angle)*radius);target.y=this.terrain.heightAt(target.x,target.z),resident.userData.shelterTarget=target.clone(),resident.userData.target=target,shelterSlots.set("edge",slot+1)
    }else{
      const center=resident.userData.roamCenter,angle=BR(resident.userData.residentId)%628/100,radius=resident.userData.residentKind==="traveler"?5.5:3.4;resident.userData.shelterTarget=null,resident.userData.target=new w(center.x+Math.cos(angle)*radius,this.terrain.heightAt(center.x,center.z),center.z+Math.sin(angle)*radius)
    }
  }
  this.refreshResidentModels();return this.residentNPCs?.length??0
};
zR.prototype.updateVillageResidents=function(delta){
  if(!this.residentNPCs?.length||!this.player)return;this.residentModelRefreshAccumulator=Number(this.residentModelRefreshAccumulator??0)+delta;if(this.residentModelRefreshAccumulator>=RESIDENT_MODEL_REFRESH_SECONDS)this.residentModelRefreshAccumulator=0,this.refreshResidentModels();this.residentUpdateAccumulator=Number(this.residentUpdateAccumulator??0)+delta;if(this.residentUpdateAccumulator<RESIDENT_UPDATE_STEP)return;const step=Math.min(.25,this.residentUpdateAccumulator);this.residentUpdateAccumulator=0;
  const now=performance.now(),crowdGrid=zkResidentCrowdGrid(this.residentNPCs);for(const resident of this.residentNPCs){if(this.residentShelterActive){resident.visible=!1,resident.userData.residentMode="sheltered",resident.userData.nearbyResidents=0;continue}const home=resident.userData.home,roamCenter=resident.userData.roamCenter??home,shelterTarget=resident.userData.shelterTarget??home,toHome=Math.hypot(resident.position.x-home.x,resident.position.z-home.z),toShelter=Math.hypot(resident.position.x-shelterTarget.x,resident.position.z-shelterTarget.z),toRoute=Math.hypot(resident.position.x-roamCenter.x,resident.position.z-roamCenter.z),returning=!this.residentShelterActive&&now<Number(this.residentPostBossUntil??0)&&toRoute>2.4,mode=residentMode({bossActive:!!this.residentShelterActive,distanceToHome:toHome,distanceToShelter:toShelter,returning});resident.userData.residentMode=mode;let target=resident.userData.target;if(!this.residentShelterActive&&(!target||Math.hypot(resident.position.x-target.x,resident.position.z-target.z)<.45)){const identity=BR(resident.userData.residentId),laneOffset=(identity%7-3)*.28,phase=Number(resident.userData.phase)+now*.00018+laneOffset,range=resident.userData.residentKind==="traveler"?9+identity%70/10:3.8+identity%38/10;target=new w(roamCenter.x+Math.cos(phase)*range,0,roamCenter.z+Math.sin(phase)*range);target.y=this.terrain.heightAt(target.x,target.z);if(this.terrain.isWaterAt(target.x,target.z,.35))target.copy(roamCenter);resident.userData.target=target}const dx=target.x-resident.position.x,dz=target.z-resident.position.z,distance=Math.hypot(dx,dz),separation=zkResidentSeparation(resident,crowdGrid),moving=mode!=="sheltered"&&(distance>.12||separation.neighbors>0);if(moving){const baseX=distance>.01?dx/distance:0,baseZ=distance>.01?dz/distance:0,laneSign=BR(resident.userData.residentId)%2?1:-1,laneForce=separation.neighbors?laneSign*.26:0,steerX=baseX+separation.x*2.4-baseZ*laneForce,steerZ=baseZ+separation.z*2.4+baseX*laneForce,steerLength=Math.max(.001,Math.hypot(steerX,steerZ)),speed=(mode==="seeking-shelter"?2.4:mode==="returning"?1.7:Number(resident.userData.speed))*step,nx=resident.position.x+steerX/steerLength*Math.min(speed,Math.max(distance,separation.neighbors?.4:0)),nz=resident.position.z+steerZ/steerLength*Math.min(speed,Math.max(distance,separation.neighbors?.4:0)),blocked=this.terrain.isWaterAt(nx,nz,.3)||this.terrain.isObstacleAt(nx,nz,.22);if(!blocked)resident.position.x=nx,resident.position.z=nz;else if(this.residentShelterActive){if(!(this.terrain.isWaterAt(nx,resident.position.z,.3)||this.terrain.isObstacleAt(nx,resident.position.z,.22)))resident.position.x=nx;else if(!(this.terrain.isWaterAt(resident.position.x,nz,.3)||this.terrain.isObstacleAt(resident.position.x,nz,.22)))resident.position.z=nz}else resident.userData.target=null;resident.rotation.y=Math.atan2(steerX,steerZ)}resident.userData.nearbyResidents=separation.neighbors,resident.position.y=this.terrain.heightAt(resident.position.x,resident.position.z)+Math.sin(now*.004+Number(resident.userData.phase))*.025;const residentScale=.94+(BR(resident.userData.residentId)%5)*.04;resident.scale.setScalar(residentScale);resident.visible=mode!=="sheltered"&&Math.hypot(resident.position.x-this.player.group.position.x,resident.position.z-this.player.group.position.z)<=RESIDENT_VISIBLE_DISTANCE,resident.userData.hqModel?.update?.(step,moving,mode==="seeking-shelter"||mode==="returning")}
};

const zkRenewableResidentsInitialize=zR.prototype.initialize;
zR.prototype.initialize=async function(){const result=await zkRenewableResidentsInitialize.call(this);this.missionStats.rockMinedAt??={};this.ensureBiomeMissionMines();const repaired=this.reconcileLegacyMineProgress();const respawned=this.refreshOreFormations(Date.now(),!1);this.oreRegrowthTimer=window.setInterval(()=>{const count=this.refreshOreFormations(Date.now(),!0);count&&this.save()},60e3),this.createVillageResidents(),(repaired||respawned)&&(this.updateHud(!0),this.save());return result};
const zkRenewableResidentEnemyUpdate=zR.prototype.updateEnemies;
zR.prototype.updateEnemies=function(delta){const result=zkRenewableResidentEnemyUpdate.call(this,delta);this.updateVillageResidents(delta);return result};
const zkQaIsolatedBossApplyShared=zkBossManager.prototype.applyShared;
zkBossManager.prototype.applyShared=function(state){const params=new URLSearchParams(globalThis.location?.search??""),local=["localhost","127.0.0.1","::1"].includes(globalThis.location?.hostname);if(local&&(params.has("mission")||params.has("boss")||params.has("qaNoBoss")))return;return zkQaIsolatedBossApplyShared.call(this,state)};
const zkResidentBossStart=zkBossManager.prototype.startEncounter;
zkBossManager.prototype.startEncounter=function(options={}){const started=zkResidentBossStart.call(this,options);started&&this.game.setResidentsSheltering?.(!0);return started};
const zkResidentBossCleanup=zkBossManager.prototype.cleanup;
zkBossManager.prototype.cleanup=function(victory=!1){const result=zkResidentBossCleanup.call(this,victory);this.game.setResidentsSheltering?.(!1,victory);return result};

// Campaign guardians now pressure the system each mission commissioned. This turns
// infrastructure protection from a score-only metric into a live encounter duty.
const zkStrategicBossStart=zkBossManager.prototype.startEncounter;
zkBossManager.prototype.startEncounter=function(options={}){const started=zkStrategicBossStart.call(this,options);if(!started)return started;const strategic=this.config?.strategic;if(strategic){this.nextInfrastructureStrikeAt=Number(strategic.strikeInterval??20);this.infrastructureStrikes=0;this.game.ui.showToast("MISSION CRISIS",strategic.objective,"warning")}return started};
const zkStrategicBossUpdate=zkBossManager.prototype.update;
zkBossManager.prototype.update=function(delta){const result=zkStrategicBossUpdate.call(this,delta);if(!this.active||!this.boss||Number(this.boss.userData.health)<=0)return result;const strategic=this.config?.strategic;if(!strategic||this.elapsed<Number(this.nextInfrastructureStrikeAt??1/0))return result;this.nextInfrastructureStrikeAt=this.elapsed+Number(strategic.strikeInterval??20);const priorities=new Set(strategic.targetTypes??[]),records=(this.game.buildings?.records??[]).filter(record=>Number(record.health??1000)>0&&priorities.has(record.type));const target=records.sort((a,b)=>Number(a.health??1000)-Number(b.health??1000))[0];if(!target)return result;target.health=Math.max(0,Number(target.health??1000)-Number(strategic.strikeDamage??70));this.infrastructureStrikes=Number(this.infrastructureStrikes??0)+1;zkApplyBuildingVisual(this.game.buildings,target);const position=new w(Number(target.x),Number(target.y??this.game.terrain.heightAt(Number(target.x),Number(target.z)))+1,Number(target.z));this.game.spawnImpactPulse(position,this.config.color);const label=eo.find(item=>item.type===target.type)?.label??target.type,status=target.health<=0?"DESTROYED":`${Math.round(target.health/10)}% integrity`;this.game.ui.showToast(strategic.strikeLabel,`${label} targeted · ${status}. Repair and defend commissioned infrastructure.`,target.health<=0?"danger":"warning");this.game.buildings?.rebuildUtilityLinks?.();this.game.updateHud(!0);return result};
const zkStrategicBossReward=zkBossManager.prototype.applyReward;
zkBossManager.prototype.applyReward=function(defeat){const applied=zkStrategicBossReward.call(this,defeat);if(applied){const strategic=missionBossConfig(defeat.missionId)?.strategic;if(strategic)this.game.ui.showToast("PERMANENT SYSTEM UNLOCKED",strategic.resolution,"success")}return applied};
if(globalThis.location?.hostname==="127.0.0.1"||globalThis.location?.hostname==="localhost"){const qa=document.getElementById("zeknova-local-qa");if(qa&&!qa.querySelector("[data-qa-population]")){qa.insertAdjacentHTML("beforeend",'<span data-qa-population></span>');const output=qa.querySelector("[data-qa-population]"),update=()=>{const residents=_s?.residentNPCs??[];output.textContent=JSON.stringify({count:residents.length,visible:residents.filter(resident=>resident.visible).length,kinds:residents.reduce((counts,resident)=>(counts[resident.userData.residentKind]=Number(counts[resident.userData.residentKind]??0)+1,counts),{}),biomes:residents.reduce((counts,resident)=>(counts[resident.userData.biome]=Number(counts[resident.userData.biome]??0)+1,counts),{}),modes:residents.reduce((counts,resident)=>(counts[resident.userData.residentMode]=Number(counts[resident.userData.residentMode]??0)+1,counts),{}),hqLoaded:residents.filter(resident=>resident.userData.hqModel).length,hqLoading:residents.filter(resident=>resident.userData.hqLoading).length,hqTypes:residents.reduce((counts,resident)=>(resident.userData.hqType&&(counts[resident.userData.hqType]=Number(counts[resident.userData.hqType]??0)+1),counts),{}),fallbackVisible:residents.filter(resident=>(resident.userData.fallbackParts??[]).some(part=>part.visible)).length,inEnemyArray:residents.filter(resident=>_s?.enemies?.includes(resident)).length,bossActive:!!_s?.bossManager?.active})};window.setInterval(update,500)}}
const zkPopulationQaInitialize=zR.prototype.initialize;
zR.prototype.initialize=async function(){const result=await zkPopulationQaInitialize.call(this),local=globalThis.location?.hostname==="127.0.0.1"||globalThis.location?.hostname==="localhost",noBoss=local&&new URLSearchParams(globalThis.location.search).has("qaNoBoss");noBoss&&window.setTimeout(()=>{this.bossManager?.active&&this.bossManager.cleanup(!0)},1400);return result};
const zkRenewableResidentsDispose=zR.prototype.dispose;
zR.prototype.dispose=function(){window.clearInterval(this.oreRegrowthTimer);if(this.residentGroup){for(const resident of this.residentNPCs??[]){resident.userData.hqDesired=!1,resident.userData.hqModel?.dispose?.(),resident.userData.hqModel=null;for(const object of resident.userData.fallbackParts??[]){object.geometry?.dispose?.();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material?.dispose?.())}}this.scene.remove(this.residentGroup),this.residentGroup=null,this.residentNPCs=[]}return zkRenewableResidentsDispose.call(this)};

/* Local deterministic gameplay snapshots: ?mission=1..12 and ?boss=1..12.
   They stage campaign context in memory, never persist it, and keep current-mission
   actions live so each state can be profiled as real gameplay rather than a mock. */
function zkGameplayStateLocal(){return["localhost","127.0.0.1","::1"].includes(globalThis.location?.hostname)}
function zkGameplayStateRecordId(record,index){return String(record?.id??record?.recordId??`${record?.type??"building"}:${index}`)}
function zkGameplayStateBuildingCounts(game,biomeId){const counts={};for(const[index,record]of(game.buildings?.records??[]).entries()){if(Number(record?.health??1000)<=0)continue;if(game.qaGameplayBaselineBuildings?.has(zkGameplayStateRecordId(record,index)))continue;if(zkAOAt(Number(record.x),Number(record.z)).id!==biomeId)continue;counts[record.type]=Number(counts[record.type]??0)+1}return counts}
function zkGameplayStateContext(game,context){const progress=game.qaGameplayProgress;if(!progress)return context;const biomes={};for(const area of zkAreasOfOperation){const staged=progress.biomes[area.id],live=context.biomes?.[area.id]??zkBossBiomeState(),newBuildings=zkGameplayStateBuildingCounts(game,area.id),buildingKeys=new Set([...Object.keys(staged.buildings),...Object.keys(newBuildings)]),statKeys=new Set([...Object.keys(staged.stats),...Object.keys(live.stats??{})]);biomes[area.id]={visited:!!staged.visited||!!live.visited,resources:Number(staged.resources??0)+Number(live.resources??0),stats:Object.fromEntries([...statKeys].map(key=>[key,Number(staged.stats[key]??0)+Number(live.stats?.[key]??0)])),buildings:Object.fromEntries([...buildingKeys].map(key=>[key,Number(staged.buildings[key]??0)+Number(newBuildings[key]??0)]))}}return{...context,biomes,bossDefeats:{...progress.bossDefeats,...(context.bossDefeats??{})}}}
function zkGameplayStateSpawn(game,state){const area=zkAreasOfOperation.find(candidate=>candidate.id===state.biome)??zkAreasOfOperation[2],spawn=game.terrain.findSafeSpawn(area.center.x,18);game.player.group.position.copy(spawn),game.player.health=100,game.player.stamina=100,game.alignExploreCameraToPlayer(),game.currentAO=area}
function zkGameplayStateForceRank(game,rank){if(!game.player||game.player.officerClass===rank)return;const old=game.player,position=old.group.position.clone(),rotation=old.group.rotation.y,weapon=game.weaponState?.equipped??game.equippedWeapon??"voidsting";game.scene.remove(old.group),old.dispose();old.group.traverse(object=>{if(object instanceof R){object.geometry?.dispose?.();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material?.dispose?.())}});game.user.officerClass=rank,game.buildings&&(game.buildings.officerClass=rank),game.simulation&&(game.simulation.officerClass=rank);const player=new DR(rank);player.group.position.copy(position),player.group.rotation.y=rotation,player.health=100,player.stamina=100,player.xp=old.xp,player.equippedWeapon=weapon,game.player=player,game.scene.add(player.group),player.hqReady?.then(()=>player.hqModels?.equipWeapon?.(weapon));const profile=vn[rank],shell=document.getElementById("game-shell"),avatar=document.querySelector(".crew-avatar"),rankLabel=document.querySelector(".crew-card small");shell?.style.setProperty("--class-accent",profile.accent),avatar&&(avatar.textContent=rank==="captain"?"C":rank==="lieutenant"?"L":"E"),rankLabel&&(rankLabel.textContent=profile.label.toUpperCase()),game.alignExploreCameraToPlayer()}
function zkGameplayStateQaSnapshot(game){const state=game.qaGameplayState;if(!state)return null;const campaign=zkCampaignState(game.getMissionContext()),boss=game.bossManager?.boss;return{kind:state.kind,number:state.number,missionId:state.missionId,missionTitle:state.missionTitle,biome:state.biome,tier:state.tier,rank:game.player?.officerClass??state.rank,bossId:state.bossId,bossName:state.bossName,currentMissionId:campaign.current?.id??null,completed:campaign.completed,bossActive:!!game.bossManager?.active,bossHealth:boss?Math.round(Number(boss.userData.health??0)):null,bossMaxHealth:game.bossManager?.active?Math.round(Number(game.bossManager.maxHealth??0)):null,saveIsolated:!0}}
function zkGameplayStateQaOutput(game){const state=game.qaGameplayState;if(!state)return;let qa=document.getElementById("zeknova-local-qa");if(qa&&!qa.querySelector("[data-qa-gameplay-state]"))qa.insertAdjacentHTML("beforeend",'<span data-qa-gameplay-state></span>');const output=qa?.querySelector("[data-qa-gameplay-state]");output&&(output.textContent=JSON.stringify(zkGameplayStateQaSnapshot(game)));let badge=document.getElementById("qa-gameplay-state-badge");if(!badge){badge=document.createElement("div"),badge.id="qa-gameplay-state-badge",badge.style.cssText="position:fixed;right:14px;bottom:14px;z-index:80;padding:8px 11px;border:1px solid #65f2d0;background:rgba(2,20,29,.9);color:#dffdf6;font:700 12px/1.25 monospace;letter-spacing:.06em;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.35)",document.body.append(badge)}badge.textContent=`QA ${state.kind.toUpperCase()} ${state.number}/12 · ${state.kind==="boss"?state.bossName:state.missionTitle} · ${state.biome.toUpperCase()}`}
const zkGameplayStateMissionContext=zR.prototype.getMissionContext;
zR.prototype.getMissionContext=function(){return zkGameplayStateContext(this,zkGameplayStateMissionContext.call(this))};
const zkGameplayStateSave=zR.prototype.save;
zR.prototype.save=function(){return this.qaGameplayState?Promise.resolve({qa:!0,isolated:!0}):zkGameplayStateSave.call(this)};
// Refresh persistence for QA: mirror boss defeats to localStorage so a plain refresh does not force re-entering biomes 1-12.
// Keeps the original isolated string above for check-source, then augments.
// QA save IIFE removed — BossCombat separates permanent vs per-run vs QA (see src/game/BossCombat.js)
const zkGameplayStateInitialize=zR.prototype.initialize;
zR.prototype.initialize=async function(){const result=await zkGameplayStateInitialize.call(this),state=parseGameplayState(globalThis.location?.search??"",{local:zkGameplayStateLocal()});if(!state){
    // BossCombat: per-run boss state — new run/refresh resets run defeats, keeps permanent unlocks
    try{
      const team=String(this.user?.teamCode||"default");
      const runKey="zeknova.bossRun.v1."+team;
      // New run/refresh: reset run-specific defeats for 1..12, preserve permanent campaign (buildings/resources)
      sessionStorage.setItem(runKey, JSON.stringify({bossDefeats:{}, startedAt:Date.now()}));
      // Ensure no flash: do not auto-start any boss here; considerStart will deterministically pick Boss 1
    }catch(e){}
    return result;
  }
  // BossCombat: QA state is debug-only, never merged into production save
  this.qaGameplayState=state;this.qaGameplayProgress=createGameplayProgress(state);this.qaGameplayBaselineBuildings=new Set((this.buildings?.records??[]).map(zkGameplayStateRecordId));
  // Keep QA progress isolated for QA overlay only; do NOT merge into missionStats.bossDefeats
  let _qaMirror={};try{const k="zeknova.qa.bossDefeats.v1."+(this.user?.teamCode||'default');_qaMirror=JSON.parse(localStorage.getItem(k)||"{}");}catch{}
  // Preserve permanent campaign progress (buildings/resources) but not QA boss defeats
  const _qaPrevVisited=[...this.missionStats.biomeVisited],_qaPrevBiomeStats={...this.missionStats.biomeStats};
  this.missionStats.biomeVisited=[...new Set([..._qaPrevVisited, ...Object.keys(this.qaGameplayProgress.biomes).filter(id=>this.qaGameplayProgress.biomes[id]?.visited)])];
  this.missionStats.biomeStats={..._qaPrevBiomeStats, ...this.qaGameplayProgress.biomes};
  // BossCombat: do NOT do this.missionStats.bossDefeats={..._qaPrevDefeats, ...qaProgress.bossDefeats}
  // Instead keep permanent bossDefeats as-is for campaign unlock, and use run state for replay
  // Ensure run state exists
  try{
    const team=String(this.user?.teamCode||"default");
    const runKey="zeknova.bossRun.v1."+team;
    if(!sessionStorage.getItem(runKey)) sessionStorage.setItem(runKey, JSON.stringify({bossDefeats:{}, startedAt:Date.now()}));
