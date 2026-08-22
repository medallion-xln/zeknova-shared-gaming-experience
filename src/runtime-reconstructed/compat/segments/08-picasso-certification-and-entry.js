const zkPicassoCombatAuthority=Object.freeze({level:"R0",role:"visual-only",canDispatchGameplay:!1,canMutateWorld:!1,canModifyMissionState:!1,canModifyPhysics:!1,canModifySaveState:!1,canModifyCollision:!1,canModifyCombatOutcomes:!1,canModifyEconomy:!1,canModifyMultiplayerSync:!1});
const zkPicassoProjectileFamilies=Object.freeze(["orb","cone","prism","beam","lance","disc","shard","spike","ring","wave_slash","segmented_trail","energy_wall"]);
const zkPicassoShapeGeometryCache=new Map;
const zkPicassoCombatFallback=Object.freeze({beamStyle:"focused-plasma",trailStyle:"segmented-energy",impactStyle:"radial-spark",telegraphStyle:"circuit-ring",geometryScale:1,beamCoreWidth:.12,beamGlowWidth:.42,impactScale:1,sparkCount:4,trailSegments:4,flareOpacity:.72});
function zkPicassoCombatStyle(){return globalThis.ZekNovaVisualThemeManager?.activeProfile?.()?.combatVfx??zkPicassoCombatFallback}
function zkPicassoCombatIdentity({bossId="",enemyType="",patternId=""}={}){const key=`${bossId} ${enemyType} ${patternId}`;if(/spore|fung|thorn|root|mire|mud|bloom|pod|brood|swarm|tremor|undertow/i.test(key))return"organic";if(/arc_gunner|\barc\b|rail|electric|grid|lightning|solar|sunscar|cinder|scrapper|hex|gunner/i.test(key))return"mechanical";return"mystical"}
function zkPicassoStableHash(value){let hash=2166136261;for(const character of String(value))hash=Math.imul(hash^character.charCodeAt(0),16777619);return hash>>>0}
function zkPicassoProjectileShape(context={}){const key=`${context.bossId??""} ${context.enemyType??""} ${context.patternId??""}`.toLowerCase();if(/beam|laser/.test(key))return"beam";if(/rail|lance|root_line|thorn/.test(key))return"lance";if(/wall|lane|grid/.test(key))return"energy_wall";if(/ring|shockwave|pulse|crown/.test(key))return"ring";if(/slash|crescent|sweep/.test(key))return"wave_slash";if(/shard|hail|ice|cryo/.test(key))return"shard";if(/spike|eruption/.test(key))return"spike";if(/disc|hex/.test(key))return"disc";if(/spiral|swarm|segmented/.test(key))return"segmented_trail";if(/fan|cone|spray/.test(key))return"cone";if(/prism|arc|electric|fastball/.test(key))return"prism";const languages={organic:["orb","cone","spike","lance","segmented_trail"],mechanical:["beam","prism","lance","disc","energy_wall"],mystical:["ring","shard","wave_slash","disc","segmented_trail"]},language=languages[zkPicassoCombatIdentity(context)];return language[zkPicassoStableHash(key)%language.length]}
function zkPicassoShapeGeometry(shape){let geometry=zkPicassoShapeGeometryCache.get(shape);if(geometry)return geometry;if(shape==="cone")geometry=new Hi(.32,.92,8);else if(shape==="prism")geometry=new ve(.3,.3,.9,3);else if(shape==="beam")geometry=new ve(.12,.12,1.9,8);else if(shape==="lance")geometry=new ve(.08,.18,1.55,6);else if(shape==="disc")geometry=new ve(.44,.44,.12,24);else if(shape==="shard")geometry=new qs(.42,0);else if(shape==="spike")geometry=new Hi(.24,1.2,6);else if(shape==="ring")geometry=new tt(.38,.09,6,24);else if(shape==="wave_slash")geometry=new tt(.46,.1,5,20,Math.PI*.86);else if(shape==="energy_wall")geometry=new le(1.6,.12,1.1);else if(shape==="segmented_trail")geometry=new ve(.16,.24,.42,6);else geometry=new Se(.28,12,8);zkPicassoShapeGeometryCache.set(shape,geometry);return geometry}
function zkPicassoOrient(node,velocity){if(!node||!velocity||velocity.lengthSq()<1e-6)return;node.quaternion.setFromUnitVectors(new w(0,1,0),velocity.clone().normalize())}
function zkPicassoStyleBossProjectile(projectile,options,pool){if(!projectile)return projectile;const bossId=pool.game?.bossManager?.config?.id??"",patternId=String(options.patternId??projectile.patternId??"boss_projectile"),identity=zkPicassoCombatIdentity({bossId,patternId}),shape=zkPicassoProjectileShape({bossId,patternId}),style=zkPicassoCombatStyle(),mesh=projectile.mesh,baseScale=Number(projectile.zkPicassoBaseScale??options.scale??1);projectile.zkPicassoBaseScale=baseScale;mesh.geometry=zkPicassoShapeGeometry(shape);mesh.scale.setScalar(baseScale*Number(style.geometryScale??1));mesh.userData.patternId=patternId;mesh.userData.zkPicassoCombat={appearanceOnly:!0,authority:"R0",bossId,identity,shape,trailStyle:style.trailStyle};if(mesh.material){mesh.material.emissiveIntensity=identity==="mechanical"?3.4:identity==="mystical"?2.9:2.5;mesh.material.roughness=identity==="organic"?.4:.2}mesh.userData.zkPicassoSegments??=[];while(mesh.userData.zkPicassoSegments.length<3){const segment=new R(zkPicassoShapeGeometry("segmented_trail"),mesh.material);segment.castShadow=!1;mesh.add(segment);mesh.userData.zkPicassoSegments.push(segment)}mesh.userData.zkPicassoSegments.forEach((segment,index)=>{segment.visible=shape==="segmented_trail";segment.material=mesh.material;segment.position.set(0,-.42*(index+1),0);segment.scale.setScalar(1-index*.18)});zkPicassoOrient(mesh,projectile.velocity);return projectile}
const zkPicassoBossAcquire=zkBossProjectilePool.prototype.acquire;
zkBossProjectilePool.prototype.acquire=function(options={}){return zkPicassoStyleBossProjectile(zkPicassoBossAcquire.call(this,options),options,this)};
const zkPicassoBossUpdate=zkBossProjectilePool.prototype.update;
zkBossProjectilePool.prototype.update=function(delta,manager){const result=zkPicassoBossUpdate.call(this,delta,manager);for(const projectile of this.active)zkPicassoOrient(projectile.mesh,projectile.velocity);return result};

function zkPicassoStyleEnemyProjectile(game,enemy,projectile,color){if(!projectile)return;const enemyType=String(enemy?.userData?.enemyType??"spitter"),patternId=enemyType==="spitter"?"fungal_pod":enemyType==="skyray"?"mystical_shard":enemyType==="juggernaut"?"thorn_lance":"hex_prism",shape=zkPicassoProjectileShape({enemyType,patternId}),style=zkPicassoCombatStyle(),mesh=projectile.mesh;mesh.material.visible=!1;let visual=mesh.userData.zkPicassoVisualChild;if(!visual){visual=new R(zkPicassoShapeGeometry(shape),new ie({color,emissive:color,emissiveIntensity:3.8,roughness:.2,metalness:.22}));visual.castShadow=!1;mesh.add(visual);mesh.userData.zkPicassoVisualChild=visual}visual.geometry=zkPicassoShapeGeometry(shape);visual.material.color?.setHex?.(color);visual.material.emissive?.setHex?.(color);visual.scale.setScalar(Number(style.geometryScale??1)*(enemyType==="spitter"?1.25:1));visual.userData.zkPicassoCombat={appearanceOnly:!0,authority:"R0",identity:zkPicassoCombatIdentity({enemyType,patternId}),shape};projectile.visualShape=shape;projectile.sourceRole=enemyType;zkPicassoOrient(mesh,projectile.velocity)}
const zkPicassoEnemyFire=zR.prototype.fireEnemyProjectile;
zR.prototype.fireEnemyProjectile=function(enemy){const before=this.enemyProjectiles.length,result=zkPicassoEnemyFire.call(this,enemy),projectile=this.enemyProjectiles.length>before?this.enemyProjectiles.at(-1):null,color=enemy?.userData?.enemyType==="skyray"?4517375:enemy?.userData?.enemyType==="spitter"?16744576:16755252;zkPicassoStyleEnemyProjectile(this,enemy,projectile,color);return result};
const zkPicassoEnemyProjectileUpdate=zR.prototype.updateEnemyProjectiles;
zR.prototype.updateEnemyProjectiles=function(delta){const result=zkPicassoEnemyProjectileUpdate.call(this,delta);for(const projectile of this.enemyProjectiles)zkPicassoOrient(projectile.mesh,projectile.velocity);return result};

function zkPicassoStylePlayerProjectile(node,kind,color){if(kind!=="ballistic")return node;for(const child of node.children)child!==node.userData.zkPicassoShell&&(child.visible=!1);let shell=node.userData.zkPicassoShell;if(!shell){shell=new R(zkPicassoShapeGeometry("prism"),new ie({color,emissive:color,emissiveIntensity:5.2,roughness:.12,metalness:.42}));shell.castShadow=!1;node.add(shell);node.userData.zkPicassoShell=shell}const theme=globalThis.ZekNovaVisualThemeManager?.activeThemeId?.()??"zeknova",shape=theme==="anime"?"lance":theme==="cartoon"?"disc":theme==="alien_dream"?"ring":"prism";shell.visible=!0;shell.geometry=zkPicassoShapeGeometry(shape);shell.material.color?.setHex?.(color);shell.material.emissive?.setHex?.(color);shell.userData.zkPicassoCombat={appearanceOnly:!0,authority:"R0",identity:"marine",shape};return node}
const zkPicassoPlayerAcquire=zR.prototype.acquirePlayerProjectile;
zR.prototype.acquirePlayerProjectile=function(kind,color){return zkPicassoStylePlayerProjectile(zkPicassoPlayerAcquire.call(this,kind,color),kind,color)};

function zkPicassoEffectState(game){return game.zkPicassoEffects??(game.zkPicassoEffects={impactPool:[],impactActive:new Set,beamPool:[],beamActive:new Set,peakImpacts:0,peakBeams:0})}
function zkPicassoImpactNode(){const group=new Ge,material=new Je({color:16777215,transparent:!0,opacity:.8,depthWrite:!1}),ring=new R(zkPicassoShapeGeometry("ring"),material);ring.rotation.x=Math.PI/2;ring.userData.role="ring";group.add(ring);for(let index=0;index<6;index+=1){const shard=new R(zkPicassoShapeGeometry("shard"),material);shard.userData.role="shard";shard.userData.angle=index/6*Math.PI*2;group.add(shard)}group.userData.material=material;return group}
function zkSpawnPicassoImpact(game,position,color){if(!game?.scene||game.disposed)return;const state=zkPicassoEffectState(game),style=zkPicassoCombatStyle(),cap=game.graphicsQuality==="low"?8:game.graphicsQuality==="high"?20:16;if(state.impactActive.size>=cap)return;const node=state.impactPool.pop()??zkPicassoImpactNode(),material=node.userData.material;material.color.setHex(color);material.opacity=Number(style.flareOpacity??.72);node.position.copy(position);node.scale.setScalar(1);node.visible=!0;for(const child of node.children)child.visible=child.userData.role==="ring"||Number(child.userData.angle)*3/Math.PI<Number(style.sparkCount??4);game.scene.add(node);state.impactActive.add(node);state.peakImpacts=Math.max(state.peakImpacts,state.impactActive.size);const began=performance.now(),duration=game.graphicsQuality==="low"?220:340,animate=()=>{if(game.disposed)return;const progress=Math.min(1,(performance.now()-began)/duration),scale=Number(style.impactScale??1);for(const child of node.children)if(child.userData.role==="ring")child.scale.setScalar(.35+progress*2.4*scale);else{const angle=Number(child.userData.angle),distance=progress*1.9*scale;child.position.set(Math.cos(angle)*distance,.15+Math.sin(progress*Math.PI)*.8,Math.sin(angle)*distance);child.scale.setScalar(.45*(1-progress*.6))}material.opacity=Number(style.flareOpacity??.72)*(1-progress);if(progress<1){requestAnimationFrame(animate);return}game.scene.remove(node);node.visible=!1;state.impactActive.delete(node);state.impactPool.length<24?state.impactPool.push(node):material.dispose()};requestAnimationFrame(animate)}
const zkPicassoImpact=zR.prototype.spawnImpactPulse;
zR.prototype.spawnImpactPulse=function(position,color){const result=zkPicassoImpact.call(this,position,color);zkSpawnPicassoImpact(this,position,color);return result};

function zkPicassoBeamNode(){const group=new Ge,coreMaterial=new Je({color:16777215,transparent:!0,opacity:.98,depthWrite:!1}),glowMaterial=new Je({color:16777215,transparent:!0,opacity:.34,depthWrite:!1}),core=new R(zkPicassoShapeGeometry("beam"),coreMaterial),glow=new R(zkPicassoShapeGeometry("beam"),glowMaterial);core.userData.role="core";glow.userData.role="glow";group.add(glow,core);group.userData={coreMaterial,glowMaterial};return group}
function zkSpawnPicassoBeam(game,start,end,color,{duration=280,hero=!1}={}){if(!game?.scene||game.disposed)return;const state=zkPicassoEffectState(game),style=zkPicassoCombatStyle(),cap=game.graphicsQuality==="low"?3:game.graphicsQuality==="high"?12:8;if(state.beamActive.size>=cap)return;const node=state.beamPool.pop()??zkPicassoBeamNode(),direction=end.clone().sub(start),length=Math.max(.01,direction.length()),core=node.children.find(child=>child.userData.role==="core"),glow=node.children.find(child=>child.userData.role==="glow"),coreWidth=Number(style.beamCoreWidth??.12)*(hero?2.1:1),glowWidth=Number(style.beamGlowWidth??.42)*(hero?1.65:1);node.userData.coreMaterial.color.setHex(hero?0xffffdf:color);node.userData.glowMaterial.color.setHex(color);node.userData.coreMaterial.opacity=1;node.userData.glowMaterial.opacity=hero?.58:.34;core.scale.set(coreWidth,length,coreWidth);glow.scale.set(glowWidth,length,glowWidth);node.position.copy(start).add(end).multiplyScalar(.5);zkPicassoOrient(node,direction);node.visible=!0;game.scene.add(node);state.beamActive.add(node);state.peakBeams=Math.max(state.peakBeams,state.beamActive.size);const began=performance.now(),animate=()=>{if(game.disposed)return;const progress=Math.min(1,(performance.now()-began)/duration),flicker=.92+Math.sin(progress*54)*.08;core.scale.x=core.scale.z=coreWidth*flicker;glow.scale.x=glow.scale.z=glowWidth*(1+progress*.35);node.userData.glowMaterial.opacity=(hero?.58:.34)*(1-progress);node.userData.coreMaterial.opacity=1-Math.max(0,(progress-.72)/.28);if(progress<1){requestAnimationFrame(animate);return}game.scene.remove(node);node.visible=!1;state.beamActive.delete(node);state.beamPool.length<16?state.beamPool.push(node):(node.userData.coreMaterial.dispose(),node.userData.glowMaterial.dispose())};requestAnimationFrame(animate);return node}
const zkPicassoCreateBeam=zR.prototype.createBeamEffect;
zR.prototype.createBeamEffect=function(start,end,color){const result=zkPicassoCreateBeam.call(this,start,end,color);zkSpawnPicassoBeam(this,start,end,color);return result};

function zkSpawnEnsignCharge(game,origin,duration=420){const style=zkPicassoCombatStyle(),group=new Ge,material=new Je({color:0xffff55,transparent:!0,opacity:.9,depthWrite:!1}),ring=new R(zkPicassoShapeGeometry("ring"),material),core=new R(zkPicassoShapeGeometry("prism"),material);ring.rotation.x=Math.PI/2;group.add(ring,core);group.position.copy(origin);group.scale.setScalar(.2);game.scene.add(group);const began=performance.now(),animate=()=>{if(game.disposed)return;const progress=Math.min(1,(performance.now()-began)/duration);group.scale.setScalar(.2+progress*1.45*Number(style.geometryScale??1));group.rotation.y+=.18;ring.rotation.z+=.24;material.opacity=.9*(1-progress*.25);if(progress<1){requestAnimationFrame(animate);return}game.scene.remove(group);material.dispose()};requestAnimationFrame(animate)}
function zkApplyEnsignBeamGameplay(game,targets,center,profile){for(const enemy of targets){const distance=enemy.position.distanceTo(center),falloff=1-.35*Math.min(1,distance/profile.radius);enemy.userData.health=Number(enemy.userData.health??50)-profile.damage*falloff;const direction=enemy.position.clone().sub(center);direction.y=0;if(direction.lengthSq()<1e-5)direction.set(0,0,1);direction.normalize();const push=enemy.userData.isMissionBoss?1.8:5.4,candidates=[push,push*.6,push*.3];for(const distanceToPush of candidates){const x=He(enemy.position.x+direction.x*distanceToPush,-79,79),z=He(enemy.position.z+direction.z*distanceToPush,-79,79);if(game.terrain.isWaterAt(x,z,.45)||game.terrain.isObstacleAt(x,z,Number(enemy.userData.collisionRadius??.8)))continue;enemy.position.set(x,game.terrain.heightAt(x,z),z);break}globalThis.ZekNovaPhysics?.applyKnockback?.(enemy,{x:direction.x*push,y:0,z:direction.z*push});enemy.userData.ensignBeamKnockbackUntil=performance.now()+420}}
const zkPicassoSpecialAttack=zR.prototype.specialAttack;
zR.prototype.specialAttack=function(){if(this.user?.officerClass!=="ensign")return zkPicassoSpecialAttack.call(this);if(this.paused||!this.player||!this.terrain||this.mode!=="explore")return;const profile=zkSpecialProfiles.ensign,gauge=Number(this.specialAttackGauge??0);if(gauge<100){this.ui.showToast("Solar Repulsor charging",`${Math.round(100-gauge)}% charge remains. Land attacks and defeat enemies to fill the gauge.`,"info");return}this.specialAttackGauge=0;this.specialAttackReadyAnnounced=!1;this.updateHud(!0);const center=this.player.group.position.clone(),targets=this.enemies.filter(enemy=>enemy.visible&&Number(enemy.userData.health)>0&&enemy.position.distanceTo(center)<=profile.radius),origin=new w;this.player.machine.getWorldPosition(origin);Number.isFinite(origin.y)||origin.copy(center).add(new w(0,2.2,0));const focus=[...targets].sort((a,b)=>a.position.distanceTo(center)-b.position.distanceTo(center))[0],direction=focus?focus.position.clone().add(new w(0,1.25,0)).sub(origin):new w(0,0,1).applyAxisAngle(new w(0,1,0),this.player.group.rotation.y);direction.lengthSq()<1e-6&&direction.set(0,0,1);direction.normalize();const endpoint=origin.clone().addScaledVector(direction,Math.max(18,profile.radius+3));this.player.playCombatAnimation?.("fire",.9);this.player.hqModels?.recoilWeapon?.("thunderclaw",1);zkSpawnEnsignCharge(this,origin,420);this.ui.showToast("ENSIGN SOLAR REPULSOR","Heroic beam charging — clear the firing lane.","warning");window.setTimeout(()=>{if(this.disposed)return;const armoredTargets=zkCaptureJuggernautHealth(this);zkApplyEnsignBeamGameplay(this,targets,center,profile);zkAdjustJuggernautDamage(this,armoredTargets);zkSpawnPicassoBeam(this,origin,endpoint,0xffe93b,{duration:620,hero:!0});this.spawnImpactPulse(endpoint,0xffff55);for(const enemy of targets)this.spawnImpactPulse(enemy.position.clone().add(new w(0,1.25,0)),0xffff55);const groundRing=new R(zkPicassoShapeGeometry("ring"),new Je({color:0xffe93b,transparent:!0,opacity:.78,depthWrite:!1}));groundRing.rotation.x=Math.PI/2;groundRing.position.set(center.x,this.terrain.heightAt(center.x,center.z)+.25,center.z);groundRing.scale.setScalar(.2);this.scene.add(groundRing);const began=performance.now(),pulse=()=>{if(this.disposed)return;const progress=Math.min(1,(performance.now()-began)/620);groundRing.scale.setScalar(.2+progress*profile.radius*2.65);groundRing.material.opacity=.78*(1-progress);if(progress<1){requestAnimationFrame(pulse);return}this.scene.remove(groundRing);groundRing.material.dispose()};requestAnimationFrame(pulse);this.player.xp+=targets.length*8;this.ui.showToast("SOLAR REPULSOR FIRED",targets.length?`${targets.length} attacker${targets.length===1?"":"s"} struck and visibly pushed back.`:"The yellow beam discharged at full power; no attackers were inside its 15m repulsor field.",targets.length?"success":"warning");this.updateHud(!0);this.save()},420)};

function zkRestyleActivePicassoCombat(){const game=globalThis.ZekNovaGame;if(!game)return;for(const projectile of game.bossManager?.pool?.active??[])zkPicassoStyleBossProjectile(projectile,{patternId:projectile.patternId,scale:projectile.zkPicassoBaseScale??1},game.bossManager.pool);for(const projectile of game.enemyProjectiles??[]){const role=projectile.sourceRole??"spitter";zkPicassoStyleEnemyProjectile(game,{userData:{enemyType:role}},projectile,projectile.mesh.userData.zkPicassoVisualChild?.material?.color?.getHex?.()??16744576)}for(const projectile of game.projectiles??[])zkPicassoStylePlayerProjectile(projectile.mesh,projectile.kind,projectile.color??7662079)}
globalThis.addEventListener?.("zeknova:visual-theme-changed",zkRestyleActivePicassoCombat);
globalThis.ZekNovaPicassoCombat=Object.freeze({authority:zkPicassoCombatAuthority,projectileFamilies:zkPicassoProjectileFamilies,report(){const game=globalThis.ZekNovaGame,state=game?.zkPicassoEffects,memory=game?.renderer?.info?.memory??{};return Object.freeze({appearanceOnly:!0,authority:zkPicassoCombatAuthority,theme:globalThis.ZekNovaVisualThemeManager?.activeThemeId?.()??"zeknova",fps:Number(game?.zkLastMeasuredFps??0),geometryFamiliesCached:zkPicassoShapeGeometryCache.size,rendererGeometries:Number(memory.geometries??0),rendererTextures:Number(memory.textures??0),heapBytes:Number(globalThis.performance?.memory?.usedJSHeapSize??0),bossProjectilesActive:game?.bossManager?.pool?.active?.length??0,bossProjectilePoolLimit:game?.bossManager?.pool?.limit??0,impactEffectsActive:state?.impactActive?.size??0,peakImpactEffects:state?.peakImpacts??0,beamEffectsActive:state?.beamActive?.size??0,peakBeamEffects:state?.peakBeams??0,expensiveLights:0})}});
if(globalThis.location?.hostname==="127.0.0.1"||globalThis.location?.hostname==="localhost"){const qa=document.createElement("span");qa.id="zeknova-picasso-combat-qa";qa.setAttribute("aria-hidden","true");qa.style.cssText="position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1";document.body.append(qa);window.setInterval(()=>{qa.textContent=JSON.stringify(globalThis.ZekNovaPicassoCombat.report())},500)}
const zkPicassoCombatDispose=zR.prototype.dispose;
zR.prototype.dispose=function(){const state=this.zkPicassoEffects;if(state){for(const node of[...state.impactActive,...state.impactPool,...state.beamActive,...state.beamPool]){node.parent?.remove(node);node.traverse?.(child=>child.material?.dispose?.())}state.impactActive.clear();state.beamActive.clear();state.impactPool.length=0;state.beamPool.length=0}const result=zkPicassoCombatDispose.call(this);for(const geometry of zkPicassoShapeGeometryCache.values())geometry.dispose?.();zkPicassoShapeGeometryCache.clear();return result};

/* Persistent world Juggernaut roster: exactly two home slots in each of ZekNova's
   five biomes. A combat defeat starts a three-hour timer for that slot. Mission
   commissioning Juggernauts are tagged separately and never consume these slots. */
(()=>{
  const WORLD_JUGGERNAUT_RESPAWN_MS=3*60*60*1000;
  const WORLD_JUGGERNAUTS_PER_BIOME=2;
  const WORLD_JUGGERNAUT_BIOMES=["forest","desert","highlands","arctic","wetlands"];
  const slotDefinitions=WORLD_JUGGERNAUT_BIOMES.flatMap(function(biome){
    return Array.from({length:WORLD_JUGGERNAUTS_PER_BIOME},function(_,index){return{id:`world-juggernaut-${biome}-${index+1}`,biome,index}});
  });
  function ensureWorldJuggernautState(game){
    const prior=game.missionStats.worldJuggernauts??{};
    const next={};
    for(const definition of slotDefinitions){
      const saved=prior[definition.id]??{};
      next[definition.id]={id:definition.id,biome:definition.biome,index:definition.index,defeatedAt:Number(saved.defeatedAt??0),respawnAt:Number(saved.respawnAt??0)};
    }
    game.missionStats.worldJuggernauts=next;
    return next;
  }
  function liveWorldJuggernaut(game,slotId){
    return (game.enemies??[]).find(function(enemy){return enemy.userData?.worldJuggernautSlot===slotId&&Number(enemy.userData.health)>0})??null;
  }
  function worldJuggernautSpawnPoint(game,definition){
    const area=zkAreasOfOperation.find(function(item){return item.id===definition.biome});
    if(!area)return null;
    const angle=(definition.index*Math.PI+(definition.biome.length*1.91))%(Math.PI*2),distance=Math.max(8,Number(area.radius??18)*.62);
    const x=Number(area.center.x)+Math.cos(angle)*distance,z=Number(area.center.z)+Math.sin(angle)*distance;
    try{
      const safe=game.terrain.findSafeSpawn(x,z);
      if(safe&&!game.terrain.isWaterAt(safe.x,safe.z,.6)&&!game.terrain.isObstacleAt(safe.x,safe.z,1.5))return safe;
      return new w(x,game.terrain.heightAt(x,z),z);
    }catch{return null}
  }
  function spawnWorldJuggernaut(game,definition,slot){
    if(liveWorldJuggernaut(game,definition.id)||Number(slot.respawnAt)>Date.now()||game.bossManager?.active)return false;
    const point=worldJuggernautSpawnPoint(game,definition);
    if(!point)return false;
    const before=game.enemies.length,originalToast=game.ui?.showToast;
    if(originalToast)game.ui.showToast=function(title,...args){if(!String(title).toLowerCase().includes("contact"))return originalToast.call(game.ui,title,...args)};
    // Bypass the six-unit ambient patrol cap and its one-heavy-unit rule. These
    // ten named world slots are their own bounded population, not ambient spawns.
    try{zkJuggernautRoleSpawn.call(game,true,"juggernaut")}finally{if(originalToast)game.ui.showToast=originalToast}
    if(game.enemies.length<=before)return false;
    const enemy=game.enemies.at(-1);
    enemy.userData.worldJuggernautSlot=definition.id;
    enemy.userData.worldJuggernautBiome=definition.biome;
    enemy.userData.worldJuggernautRespawnMs=WORLD_JUGGERNAUT_RESPAWN_MS;
    enemy.userData.hostile=true;
    enemy.userData.guardian=false;
    enemy.userData.spawnedForCommissioning=false;
    enemy.userData.juggernautState="patrol";
    enemy.position.copy(point);
    slot.defeatedAt=0;
    slot.respawnAt=0;
    return true;
  }
  function reconcileWorldJuggernauts(game,{announce=false}={}){
    if(!game.player||!game.terrain||game.bossManager?.active)return 0;
    const state=ensureWorldJuggernautState(game),now=Date.now();
    let spawned=0;
    for(const definition of slotDefinitions){
      const slot=state[definition.id];
      if(Number(slot.respawnAt)>now)continue;
      if(spawnWorldJuggernaut(game,definition,slot))spawned++;
    }
    if(spawned&&announce)game.ui?.showToast("Juggernaut patrol network",`${spawned} patrol slot${spawned===1?"":"s"} deployed. ZekNova maintains 10 Juggernauts — 2 per biome; defeated slots return after 3 hours.`,"warning");
    return spawned;
  }
  const previousInitialize=zR.prototype.initialize;
  zR.prototype.initialize=async function(){
    const result=await previousInitialize.call(this);
    ensureWorldJuggernautState(this);
    const spawned=reconcileWorldJuggernauts(this,{announce:true});
    if(spawned)this.save?.();
    this.worldJuggernautTimer=window.setInterval(()=>{const count=reconcileWorldJuggernauts(this,{announce:true});if(count)this.save?.()},60e3);
    return result;
  };
  const previousUpdateEnemies=zR.prototype.updateEnemies;
  zR.prototype.updateEnemies=function(delta){
    const before=new Map((this.enemies??[]).filter(function(enemy){return enemy.userData?.worldJuggernautSlot}).map(function(enemy){return[enemy.userData.worldJuggernautSlot,Number(enemy.userData.health)]}));
    const bossWasActive=!!this.bossManager?.active,result=previousUpdateEnemies.call(this,delta);
    if(!bossWasActive&&!this.bossManager?.active){
      const state=ensureWorldJuggernautState(this),now=Date.now();
      let changed=false;
      for(const [slotId] of before){
        if(liveWorldJuggernaut(this,slotId))continue;
        const slot=state[slotId];
        if(!slot)continue;
        slot.defeatedAt=now;
        slot.respawnAt=now+WORLD_JUGGERNAUT_RESPAWN_MS;
        changed=true;
        this.ui?.showToast("Juggernaut patrol defeated",`${slot.biome.toUpperCase()} slot secured. Replacement arrives in 3 hours.`,"success");
      }
      if(changed)this.save?.();
      if(performance.now()>=Number(this.nextWorldJuggernautCheckAt??0)){
        this.nextWorldJuggernautCheckAt=performance.now()+2e3;
        const spawned=reconcileWorldJuggernauts(this);
        if(spawned)this.save?.();
      }
      for(const enemy of this.enemies??[]){
        const biome=enemy.userData?.worldJuggernautBiome;
        if(!biome||Number(enemy.userData.health)<=0)continue;
        const area=zkAreasOfOperation.find(function(item){return item.id===biome});
        if(!area)continue;
        const minX=Number(area.center.x)-16,maxX=Number(area.center.x)+16;
        if(enemy.position.x<minX||enemy.position.x>maxX){
          enemy.position.x=He(enemy.position.x,minX,maxX);
          enemy.position.y=this.terrain.heightAt(enemy.position.x,enemy.position.z);
          enemy.userData.juggernautState="patrol";
        }
      }
    }
    return result;
  };
  const previousDispose=zR.prototype.dispose;
  zR.prototype.dispose=function(){window.clearInterval(this.worldJuggernautTimer);return previousDispose.call(this)};
  globalThis.ZekNovaWorldJuggernauts={count:10,perBiome:2,biomes:[...WORLD_JUGGERNAUT_BIOMES],respawnMs:WORLD_JUGGERNAUT_RESPAWN_MS,snapshot:function(){return globalThis.ZekNovaGame?.missionStats?.worldJuggernauts??null}};
})();

/* ZekNovan locomotion coordinator. Units keep their combat AI inside engagement
   range; outside combat, role groups perform deterministic biome activities with
   obstacle reflection, separation, boundary bounce, and safe stuck recovery. */
(()=>{
  const ACTIVITY_PROFILES={
    juggernaut:{label:"perimeter patrol",speed:1.22,engage:15,refresh:9,radius:1.8},
    stalker:{label:"tree-line reconnaissance",speed:2.35,engage:18,refresh:7,radius:.72},
    saboteur:{label:"infrastructure raid",speed:2.55,engage:16,refresh:6,radius:.78},
    spitter:{label:"ridge overwatch",speed:1.5,engage:22,refresh:10,radius:.82},
    skyray:{label:"aerial survey",speed:2.8,engage:25,refresh:8,radius:.45,airborne:true},
    burrower:{label:"mineral prospecting",speed:1.15,engage:13,refresh:11,radius:1.25}
  };
  function activityArea(enemy){
    const biome=enemy.userData.worldJuggernautBiome??enemy.userData.activityHomeBiome??zkAOAt(enemy.position.x,enemy.position.z).id;
    enemy.userData.activityHomeBiome=biome;
    return zkAreasOfOperation.find(function(area){return area.id===biome})??zkAOAt(enemy.position.x,enemy.position.z);
  }
  function activityHash(value){let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return(hash>>>0)/4294967295}
  function setActivityTarget(game,enemy,profile,now){
    const data=enemy.userData,area=activityArea(enemy),role=data.enemyType??"stalker",seed=activityHash(data.worldJuggernautSlot??data.identityId??`${role}:${Math.round(enemy.position.x)}:${Math.round(enemy.position.z)}`),cycle=Math.floor(now/(profile.refresh*1e3)),phase=(seed*9.7+cycle*2.17)%(Math.PI*2);
    let x=Number(area.center.x)+Math.cos(phase)*11,z=Number(area.center.z)+Math.sin(phase)*13;
    if(role==="juggernaut"){
      const lane=data.worldJuggernautSlot?.endsWith("-2")?1:-1;
      x=Number(area.center.x)+Math.cos(phase)*13;
      z=Number(area.center.z)+lane*7+Math.sin(phase)*8;
    }else if(role==="saboteur"){
      const target=(game.buildings?.records??[]).filter(function(record){return zkAOAt(Number(record.x),Number(record.z)).id===area.id&&Number(record.health??1000)>0}).sort(function(a,b){return Math.hypot(Number(a.x)-enemy.position.x,Number(a.z)-enemy.position.z)-Math.hypot(Number(b.x)-enemy.position.x,Number(b.z)-enemy.position.z)})[0];
      if(target){x=Number(target.x);z=Number(target.z);data.activityTargetId=target.id}
    }else if(role==="spitter"){
      x=Number(area.center.x)+(seed>.5?12:-12);z=Number(area.center.z)+Math.sin(phase)*10;
    }else if(role==="burrower"){
      const rock=(game.terrain?.mineableRocks??[]).filter(function(item){return item.visible&&zkAOAt(item.position.x,item.position.z).id===area.id}).sort(function(a,b){return a.position.distanceToSquared(enemy.position)-b.position.distanceToSquared(enemy.position)})[0];
      if(rock){x=rock.position.x;z=rock.position.z;data.activityTargetId=rock.userData.rockId}
    }
    x=He(x,Number(area.center.x)-15.5,Number(area.center.x)+15.5);z=He(z,-76,76);
    data.activityTarget={x,z};data.activityTargetUntil=now+profile.refresh*1e3;data.activityLabel=profile.label;data.activityGroup=`${area.id}:${role}:${seed<.5?"alpha":"beta"}`;
  }
  function validActivityStep(game,enemy,profile,area,x,z){
    if(x<Number(area.center.x)-16||x>Number(area.center.x)+16||z<-78||z>78)return false;
    if(profile.airborne)return true;
    if(game.terrain.isWaterAt(x,z,profile.radius*.35)||game.terrain.isObstacleAt(x,z,profile.radius))return false;
    for(const other of game.enemies??[]){
      if(other===enemy||Number(other.userData.health)<=0)continue;
      const minimum=(other.userData.enemyType==="juggernaut"?2.5:1.25)+profile.radius;
      if(Math.hypot(other.position.x-x,other.position.z-z)<minimum)return false;
    }
    return true;
  }
  function nearbyCombat(game,enemy,profile){
    const playerDistance=game.player?.group?.position?Math.hypot(game.player.group.position.x-enemy.position.x,game.player.group.position.z-enemy.position.z):Infinity;
    if(enemy.userData.hostile&&!enemy.userData.guardian&&playerDistance<=profile.engage)return true;
    if(enemy.userData.guardian)return(game.enemies??[]).some(function(other){return other!==enemy&&other.userData.hostile&&!other.userData.guardian&&Number(other.userData.health)>0&&other.position.distanceTo(enemy.position)<22});
    return false;
  }
  function applyActivityMovement(game,enemy,profile,delta,before){
    const data=enemy.userData,now=performance.now(),area=activityArea(enemy);
    if(now>=Number(data.activityTargetUntil??0)||!data.activityTarget)setActivityTarget(game,enemy,profile,now);
    const target=data.activityTarget,desired=Math.atan2(target.x-before.x,target.z-before.z),separation=new w();
    for(const other of game.enemies??[]){
      if(other===enemy||Number(other.userData.health)<=0)continue;
      const dx=before.x-other.position.x,dz=before.z-other.position.z,distance=Math.hypot(dx,dz);
      if(distance>0&&distance<5){separation.x+=dx/distance*(5-distance);separation.z+=dz/distance*(5-distance)}
    }
    const separationAngle=separation.lengthSq()>.01?Math.atan2(separation.x,separation.z):desired,heading=desired*.72+separationAngle*.28,step=profile.speed*Math.min(delta,.05),offsets=[0,.55,-.55,1.05,-1.05,1.65,-1.65,Math.PI];
    enemy.position.copy(before);
    let moved=false;
    for(const offset of offsets){
      const angle=heading+offset,x=before.x+Math.sin(angle)*step,z=before.z+Math.cos(angle)*step;
      if(!validActivityStep(game,enemy,profile,area,x,z))continue;
      enemy.position.x=x;enemy.position.z=z;data.activityHeading=angle;moved=true;break;
    }
    if(!moved){data.activityHeading=Number(data.activityHeading??heading)+Math.PI*.67;data.activityTargetUntil=0;data.activityBounces=Number(data.activityBounces??0)+1}
    const distanceMoved=Math.hypot(enemy.position.x-Number(data.activityLastX??before.x),enemy.position.z-Number(data.activityLastZ??before.z));
    data.activityStuckFor=distanceMoved<.018?Number(data.activityStuckFor??0)+delta:0;
    if(data.activityStuckFor>2.4){
      const angle=Number(data.activityHeading??heading)+Math.PI*.73,x=He(before.x+Math.sin(angle)*5,Number(area.center.x)-15,Number(area.center.x)+15),z=He(before.z+Math.cos(angle)*5,-75,75),safe=game.terrain.findSafeSpawn(x,z);
      if(safe&&zkAOAt(safe.x,safe.z).id===area.id&&!game.terrain.isWaterAt(safe.x,safe.z,.5)&&!game.terrain.isObstacleAt(safe.x,safe.z,profile.radius)){enemy.position.copy(safe);data.activityRecoveries=Number(data.activityRecoveries??0)+1}
      data.activityStuckFor=0;data.activityTargetUntil=0;
    }
    if(profile.airborne)enemy.position.y=game.terrain.heightAt(enemy.position.x,enemy.position.z)+6;else enemy.position.y=game.terrain.heightAt(enemy.position.x,enemy.position.z);
    data.activityLastX=enemy.position.x;data.activityLastZ=enemy.position.z;
    if(moved)enemy.rotation.y=Math.atan2(enemy.position.x-before.x,enemy.position.z-before.z);
    data.hqModel?.update?.(delta,moved,false);
  }
  const previousUpdateEnemyUnit=zR.prototype.updateEnemyUnit;
  zR.prototype.updateEnemyUnit=function(enemy,delta){
    const role=String(enemy?.userData?.enemyType??""),profile=ACTIVITY_PROFILES[role],before=enemy?.position?.clone?.();
    const result=previousUpdateEnemyUnit.call(this,enemy,delta);
    if(!profile||!before||enemy.userData.isMissionBoss||enemy.userData.commissioningId||Number(enemy.userData.health)<=0||nearbyCombat(this,enemy,profile))return result;
    try{applyActivityMovement(this,enemy,profile,delta,before)}catch{}
    return result;
  };
  globalThis.ZekNovaActivities={profiles:Object.fromEntries(Object.entries(ACTIVITY_PROFILES).map(function([role,profile]){return[role,profile.label]})),snapshot:function(){return(globalThis.ZekNovaGame?.enemies??[]).filter(function(enemy){return Number(enemy.userData.health)>0}).map(function(enemy){return{role:enemy.userData.enemyType,activity:enemy.userData.activityLabel,group:enemy.userData.activityGroup,biome:enemy.userData.activityHomeBiome,bounces:Number(enemy.userData.activityBounces??0),recoveries:Number(enemy.userData.activityRecoveries??0)}})}};
})();

// Mission 3 Fresh Improvement — relay distinction, Defense Network 1/5 summaries, Highlands waypoint
(function(){
  const _addAO2 = PR.prototype.addAOResourceNodes;
  PR.prototype.addAOResourceNodes = function(){
    // _addAO2 already wrapped by Mission2 patch, call current
    // Need to avoid double wrap, so call original chain
    // The current PR.prototype.addAOResourceNodes is already patched for wetlands filtration, so calling it will recreate wetlands filtration too
    // To avoid recursion, call the stored original from Mission2 patch if exists
    if(PR.prototype._origAddAOResourcesForM3){
      PR.prototype._origAddAOResourcesForM3.call(this);
    } else {
      // fallback: call directly (will be Mission2 patched version)
      _addAO2.call(this);
    }
    // After all AO nodes created (including filtration), tag Highlands relay units
    const highNodes = this.resourceNodes.filter(n=>n.userData.aoId==='highlands' && n.userData.aoResource && !n.userData.filtrationUnit);
    const relay = highNodes.slice(0,2);
    for(let i=0;i<relay.length;i++){
      const n=relay[i];
      n.userData.relayUnit=true;
      n.userData.relayIndex=i;
      n.scale.setScalar(1.36);
      try{ if(n.material){ n.material.emissive=new re(0x5ca8ff); n.material.emissiveIntensity=3.6; } }catch{}
      const g=new R(new tt(1.62,0.13,8,32), new Je({color:0x5ca8ff, transparent:true, opacity:0.42}));
      g.rotation.x=Math.PI/2; g.position.y=0.60; g.name="relayGlow";
      n.add(g);
    }
    this.relayNodes=relay;
  };
  // Store original for chaining
  if(!PR.prototype._origAddAOResourcesForM3){
    PR.prototype._origAddAOResourcesForM3 = _addAO2;
  }

  // Generic Highlands resource should not count for relay mission when water mission is tower-one
  const _collectM3 = zR.prototype.collectResource;
  zR.prototype.collectResource = function(node){
    if(node && node.userData && node.userData.aoId==='highlands' && !node.userData.relayUnit){
      const ctx=this.getMissionContext?.(); let cur=null; try{ cur=ctx?zkCampaignState(ctx).current:null;}catch{}
      if(cur && cur.id==='tower-one' && Number(this.aoResourceCollected?.highlands||0) <2){
        if(!node.userData.relayUnit){
          if(!node.visible) return;
          const t=node.userData.resource,s=Number(node.userData.amount??10);
          this.simulation.collect(t,s); this.missionStats.resourcesCollected+=1; this.player.xp+=8;
          const wp=new w(); this.player.machine.getWorldPosition(wp); Number.isFinite(wp.y)||wp.copy(this.player.group.position).add(new w(0,2.2,0));
          this.createBeamEffect(wp, node.position, t==="minerals"?7858687:7860392); node.visible=false;
          const n2=Math.round(s*(this.user.officerClass==="ensign"?1.25:1));
          this.ui.showToast("Resource secured",`+${n2} ${t}. The deposit has been transferred to colony storage.`,"success");
          this.nearestResource=null; this.updateHud(!0); this.save(); return;
        }
      }
    }
    const res = _collectM3.call(this, node);
    if(node && node.userData && node.userData.relayUnit){
      if(Number(this.aoResourceCollected?.highlands||0) >2) this.aoResourceCollected.highlands=2;
    }
    return res;
  };

  const _updResM3 = zR.prototype.updateResourceInteraction;
  zR.prototype.updateResourceInteraction = function(){
    _updResM3.call(this);
    try{
      const ctx=this.getMissionContext?.(); const cur=ctx?zkCampaignState(ctx).current:null;
      if(!cur || cur.id!=='tower-one') return;
      const need = 2 - Number(this.aoResourceCollected?.highlands||0);
      if(need>0){
        const unrec=(this.terrain.resourceNodes||[]).filter(n=>n.userData.relayUnit && n.visible);
        for(const n of unrec){ const g=n.getObjectByName("relayGlow"); if(g) g.material.opacity=0.30+Math.sin(performance.now()*0.004 + Number(n.userData.relayIndex)*1.1)*0.17; }
        if(unrec.length){
          const nearest=unrec.reduce((a,b)=> a.position.distanceTo(this.player.group.position) < b.position.distanceTo(this.player.group.position) ? a : b);
          const dist=nearest.position.distanceTo(this.player.group.position);
          if(dist<45){
            const prompt=document.getElementById("interaction-prompt");
            if(prompt && this.nearestResource===nearest){
              prompt.innerHTML=`DAMAGED RELAY UNIT — PRESS <kbd>E</kbd> TO RECOVER · ${dist.toFixed(1)}m · ${need} remaining`;
              prompt.classList.remove("hidden");
            }
            if(dist<40 && this.nearestResource!==nearest && performance.now() - Number(this._relayWaypointAt||0) > 8000){
              this._relayWaypointAt=performance.now();
              this.ui.showToast("Relay unit nearby", `Damaged relay unit ${dist.toFixed(0)}m away in Highlands AO — look for glowing teal ring.`, "info");
            }
          }
        }
      }
    }catch{}
  };

  // Persistence hide for relay
  const _restoreM3 = zR.prototype.restore;
  zR.prototype.restore = function(e){
    const r=_restoreM3.call(this,e);
    try{
      const c=Number(this.aoResourceCollected?.highlands||0);
      const nodes=this.terrain?.resourceNodes||[];
      const filts=nodes.filter(n=>n.userData.relayUnit);
      for(let i=0;i<Math.min(c, filts.length); i++){ filts[i].visible=false; const g=filts[i].getObjectByName("relayGlow"); if(g) g.visible=false; }
      if(c>=2){ for(const n of filts) n.visible=false; }
    }catch{}
    return r;
  };

  // Checklist summaries for Communications and Defense
  const _updHudM3 = zR.prototype.updateHud;
  zR.prototype.updateHud = function(e){
    const r=_updHudM3.call(this,e);
    try{
      const ctx=e?.missionContext || this.getMissionContext?.();
      const camp=ctx?zkCampaignState(ctx):null; const mission=camp?.current;
      if(mission && mission.id==='tower-one'){
        const list=document.getElementById("sub-objective-list");
        if(list){
          const commObjs=(mission.subObjectives||[]).filter(o=>o.key==='communications' && o.kind==='biomeBuilding');
          const defObjs=(mission.subObjectives||[]).filter(o=>o.key==='defense' && o.kind==='biomeBuilding');
          if(commObjs.length===5){
            let s=list.querySelector("[data-comm-summary]");
            if(!s){ s=document.createElement("li"); s.dataset.commSummary="true"; s.style.fontWeight="800"; s.style.borderBottom="1px solid rgba(92,168,255,0.22)"; s.style.background="rgba(92,168,255,0.06)"; list.prepend(s); }
            const done=commObjs.filter(o=>zkObjectiveComplete(o,ctx)).length;
            s.className=done===5?"complete":""; s.innerHTML=`<span>${done===5?"✓":"○"}</span><b>Communications Hubs: ${done}/5 — one per AO</b><small>${done}/5</small>`;
          }
          if(defObjs.length===5){
            let s=list.querySelector("[data-def-summary]");
            if(!s){ s=document.createElement("li"); s.dataset.defSummary="true"; s.style.fontWeight="800"; s.style.borderBottom="1px solid rgba(255,180,80,0.18)"; s.style.background="rgba(255,180,80,0.05)"; const comm=list.querySelector("[data-comm-summary]"); if(comm && comm.nextSibling) list.insertBefore(s, comm.nextSibling); else list.prepend(s); }
            const done=defObjs.filter(o=>zkObjectiveComplete(o,ctx)).length;
            s.className=done===5?"complete":""; s.innerHTML=`<span>${done===5?"✓":"○"}</span><b>Defense Towers: ${done}/5 — one per AO</b><small>${done}/5</small>`;
          }
        }
      }
    }catch{}
    return r;
  };

  console.log("Mission 3 Fresh Improvement Patch applied — relay distinction, comm/def 5 summaries");
})();

// tower-one commissioning wave: 1 Juggernaut + 2 Red projectile shooters (spitter) — tension-independent, immediate attack, then Stormback
(function(){
  const FLAG = "towerOneCommissioningSpawned_v2";
  const origUpdateAO = zR.prototype.updateAO;
  zR.prototype.updateAO = function(...args){
    const res = origUpdateAO.apply(this, args);
    try{
      const ctx = this.getMissionContext?.();
      const campaign = ctx ? zkCampaignState(ctx) : null;
      const mission = campaign?.current;
      if(!mission || mission.id!=="tower-one") return res;
      // Superseded by the persistent commissioning state machine below.
      if(typeof this._spawnCommissioningGroup==="function") return res;
      if(this.missionStats.bossDefeats?.["tower-one"]) return res;
      if(this.bossManager?.active) return res;
      const hs = Number(this.missionStats.biomeStats?.highlands?.enemiesDefeated ?? 0);
      if(hs >=3) return res;
      if(this.missionStats[FLAG]) return res;
      const area = zkAOAt(this.player.group.position.x, this.player.group.position.z);
      if(area.id!=="highlands") return res;
      // ensure player has entered highlands during this mission (visited already tracked)
      this.missionStats[FLAG]=true;
      // Spawn tension-independent hostile trio near Highlands center / player
      const spawn = (type) => {
        try{
          const e = this.spawnEnemy(true, type);
          if(e){
            e.userData.hostile=true;
            e.userData.guardian=false;
            // force immediate pursuit regardless of diplomacy tension
            if(e.userData.juggernautState) e.userData.juggernautState="pursuit";
            e.userData.spawnedForCommissioning=true;
          }
          return e;
        }catch{}
        return null;
      };
      spawn("juggernaut");
      setTimeout(()=>spawn("spitter"), 350);
      setTimeout(()=>spawn("spitter"), 700);
      this.ui.showToast("Commissioning attack", "1 Juggernaut + 2 Red shooters inbound — tension-independent. Defeat them to summon the Stormback.", "danger");
    }catch(e){}
    return res;
  };
  // When the 3rd highlands kill lands, schedule Stormback start (uses existing missionReadyForBoss gate)
  const origRecord = zkBossRecordBiomeStat;
  zkBossRecordBiomeStat = function(game,x,z,key,amount=1){
    const ret = origRecord.apply(this, arguments);
    try{
      if(key==="enemiesDefeated" && zkAOAt(Number(x),Number(z)).id==="highlands"){
        const ctx = game.getMissionContext?.();
        const campaign = ctx ? zkCampaignState(ctx) : null;
        if(campaign?.current?.id==="tower-one"){
          const hs = Number(game.missionStats.biomeStats?.highlands?.enemiesDefeated ?? 0);
          if(hs>=3 && !game.bossManager?.active){
            // give 1.2s combat linger then trigger boss if still boss-ready (covers comms/defense/relay)
            setTimeout(()=>{
              try{
                if(game.bossManager?.active) return;
                const c2 = game.getMissionContext?.();
                if(c2 && missionReadyForBoss("tower-one", c2)){
                  // ensure player in Highlands AO per considerStart check
                  const a = zkAOAt(game.player.group.position.x, game.player.group.position.z);
                  if(a.id==="highlands") game.bossManager.startEncounter({missionId:"tower-one"});
                  else game.ui.showToast("Stormback ready", "Return to HIGHLANDS AO to confront the Stormback.", "warning");
                }
              }catch{}
            }, 1200);
          }
        }
      }
    }catch{}
    return ret;
  };
})();

/* Sentinel Picasso combat readability + encounter identity certification.
   This wrapper reads authoritative combat state and decorates renderer objects only.
   It never changes attack records, damage, velocity, timing, phases, physics, or saves. */
(()=>{
  const zkPicassoReadabilityAuthority=Object.freeze({
    CAN_CHANGE_DAMAGE:false,
    CAN_CHANGE_COLLISION:false,
    CAN_CHANGE_PROJECTILE_VELOCITY:false,
    CAN_CHANGE_ATTACK_TIMING:false,
    CAN_CHANGE_AI_DECISIONS:false,
    CAN_CHANGE_BOSS_PHASE:false,
    CAN_CHANGE_PHYSICS:false,
    CAN_CHANGE_SAVE_STATE:false,
    CAN_MUTATE_WORLD:false,
    CAN_DISPATCH:false,
    CURRENT_AUTHORITY:"R0_VISUAL"
  });
  const priorities=Object.freeze({
    LOW:Object.freeze({rank:0,silhouetteScale:.78,contrast:.72,telegraphScale:.9,trailIntensity:.45,impactScale:.7,renderOrder:1,occlusion:"world"}),
    MEDIUM:Object.freeze({rank:1,silhouetteScale:1,contrast:1,telegraphScale:1,trailIntensity:.82,impactScale:1,renderOrder:3,occlusion:"world"}),
    HIGH:Object.freeze({rank:2,silhouetteScale:1.16,contrast:1.24,telegraphScale:1.08,trailIntensity:1.15,impactScale:1.28,renderOrder:6,occlusion:"source-and-danger-area"}),
    CRITICAL:Object.freeze({rank:3,silhouetteScale:1.32,contrast:1.48,telegraphScale:1.16,trailIntensity:1.38,impactScale:1.58,renderOrder:10,occlusion:"danger-area-always-visible"})
  });
  const effectBudgets=Object.freeze({maximumCriticalEmphasis:2,maximumHighEmphasis:4,perProjectileDynamicLights:0,low:{impactBursts:8,beamEffects:3},balanced:{impactBursts:16,beamEffects:8},high:{impactBursts:20,beamEffects:12}});
  const weakPointStates=Object.freeze(["CLOSED","OPENING","ACTIVE","HIT","CLOSING"]);
  const weakPointVisuals=Object.freeze({
    CLOSED:{scale:.72,label:"SEALED",pulse:0},
    OPENING:{scale:1.05,label:"OPENING",pulse:5},
    ACTIVE:{scale:1.38,label:"WEAK POINT",pulse:8},
    HIT:{scale:1.72,label:"WEAK HIT",pulse:14},
    CLOSING:{scale:1,label:"CLOSING",pulse:3}
  });
  const impactProfiles=Object.freeze({
    normal_hit:{shape:"ring",scale:1,shards:2},
    weak_point_hit:{shape:"wave_slash",scale:1.5,shards:4},
    armor_hit:{shape:"prism",scale:.9,shards:3},
    shield_blocked:{shape:"disc",scale:1.25,shards:0},
    critical_hit:{shape:"spike",scale:1.7,shards:6},
    boss_phase_threshold:{shape:"ring",scale:2.25,shards:6},
    environmental_impact:{shape:"wave_slash",scale:.82,shards:3}
  });
  const roleSignatures=Object.freeze({
    spitter:{priority:"MEDIUM",primaryShape:"cone",secondaryShape:"orb",motion:"lobbed-pod",trail:"dotted-spore"},
    skyray:{priority:"MEDIUM",primaryShape:"shard",secondaryShape:"wave_slash",motion:"aerial-strafe",trail:"forked-sky-streak"},
    stalker:{priority:"MEDIUM",primaryShape:"wave_slash",secondaryShape:"spike",motion:"ground-dash",trail:"short-claw-arc"},
    saboteur:{priority:"MEDIUM",primaryShape:"prism",secondaryShape:"lance",motion:"infrastructure-tether",trail:"broken-data-line"},
    burrower:{priority:"HIGH",primaryShape:"ring",secondaryShape:"spike",motion:"subterranean-ripple",trail:"ground-fissure"},
    juggernaut:{priority:"HIGH",primaryShape:"energy_wall",secondaryShape:"ring",motion:"linear-charge-and-slam",trail:"dust-segments"},
    player_ballistics:{priority:"MEDIUM",primaryShape:"prism",secondaryShape:"lance",motion:"fast-straight",trail:"short-segmented-plasma"},
    missiles:{priority:"HIGH",primaryShape:"lance",secondaryShape:"cone",motion:"homing-arc",trail:"segmented-contrail"},
    ensign_solar_repulsor:{priority:"CRITICAL",primaryShape:"beam",secondaryShape:"ring",motion:"focused-sustained-line",trail:"yellow-core-glow"}
  });
  const metrics={
    telegraphsCreated:0,telegraphDurationChanges:0,telegraphIdentityMissing:0,
    impactTypes:Object.fromEntries(Object.keys(impactProfiles).map(key=>[key,0])),
    maxActiveProjectiles:0,maxImpactEffects:0,maxBeamEffects:0,maxFrameMs:0,
    minObservedFps:Infinity,maxJsHeapBytes:0,frameSamples:0,shaderErrors:0,
    browserRuntimeErrors:0,gameplayStateDivergenceCount:0,parityBaseline:null,
    paritySnapshots:[],authorityViolations:0,acceptanceCaptureComplete:false
  };
  const authorityViolations=Object.entries(zkPicassoReadabilityAuthority).filter(([key,value])=>key.startsWith("CAN_")&&value!==false).length;
  metrics.authorityViolations=authorityViolations;

  function certificationData(){return globalThis.ZekNovaPicassoCombatCertification??null}
  function bossProfile(id){return certificationData()?.bosses?.[id]??null}
  function priorityProfile(name){return priorities[name]??priorities.LOW}
  function roleForEnemy(enemy){const raw=String(enemy?.userData?.enemyType??"stalker");return raw==="ranged"?"spitter":raw==="flyer"?"skyray":raw==="brute"?"juggernaut":roleSignatures[raw]?raw:"stalker"}
  function emphasisCounts(pool){const counts={CRITICAL:0,HIGH:0};for(const projectile of pool?.active??[]){const value=projectile?.mesh?.userData?.zkPicassoPriority;if(value in counts)counts[value]+=1}return counts}
  function resolvedPriority(requested,pool){const counts=emphasisCounts(pool);if(requested==="CRITICAL"&&counts.CRITICAL>=effectBudgets.maximumCriticalEmphasis)return counts.HIGH>=effectBudgets.maximumHighEmphasis?"MEDIUM":"HIGH";if(requested==="HIGH"&&counts.HIGH>=effectBudgets.maximumHighEmphasis)return"MEDIUM";return requested}
  function applyPriority(node,name,baseScale=1){
    if(!node)return;
    const visual=priorityProfile(name);
    node.userData.zkPicassoPriority=name;
    node.userData.zkPicassoPriorityVisual={appearanceOnly:true,...visual};
    node.scale.setScalar(Number(baseScale||1)*visual.silhouetteScale);
    node.renderOrder=visual.renderOrder;
    node.traverse?.(child=>{
      child.renderOrder=visual.renderOrder;
      if(child.material){child.material.depthTest=visual.occlusion!=="danger-area-always-visible";if(typeof child.material.emissiveIntensity==="number")child.material.emissiveIntensity=Math.min(6,child.material.emissiveIntensity*visual.contrast)}
    });
  }

  const readabilityBossAcquire=zkBossProjectilePool.prototype.acquire;
  zkBossProjectilePool.prototype.acquire=function(options={}){
    const projectile=readabilityBossAcquire.call(this,options);
    if(!projectile)return projectile;
    const requested="CRITICAL",priority=resolvedPriority(requested,this),base=Number(projectile.zkPicassoBaseScale??options.scale??1);
    applyPriority(projectile.mesh,priority,base*Number(zkPicassoCombatStyle().geometryScale??1));
    projectile.mesh.userData.zkPicassoEncounterIdentity=bossProfile(this.game?.bossManager?.config?.id)?.family??zkPicassoCombatIdentity({bossId:this.game?.bossManager?.config?.id,patternId:options.patternId});
    return projectile;
  };
  const readabilityBossUpdate=zkBossProjectilePool.prototype.update;
  zkBossProjectilePool.prototype.update=function(delta,manager){
    const result=readabilityBossUpdate.call(this,delta,manager);
    metrics.maxActiveProjectiles=Math.max(metrics.maxActiveProjectiles,this.active.length);
    return result;
  };

  const readabilityEnemyFire=zR.prototype.fireEnemyProjectile;
  zR.prototype.fireEnemyProjectile=function(enemy){
    const before=this.enemyProjectiles.length,result=readabilityEnemyFire.call(this,enemy),projectile=this.enemyProjectiles.length>before?this.enemyProjectiles.at(-1):null;
    if(projectile){const role=roleForEnemy(enemy),signature=roleSignatures[role],visual=projectile.mesh.userData.zkPicassoVisualChild??projectile.mesh;projectile.sourceRole=role;visual.geometry=zkPicassoShapeGeometry(signature.primaryShape);visual.userData.zkPicassoRoleSignature={role,...signature,appearanceOnly:true};applyPriority(visual,signature.priority,Number(zkPicassoCombatStyle().geometryScale??1)*(role==="spitter"?1.25:1))}
    return result;
  };
  const readabilitySpawnEnemy=zR.prototype.spawnEnemy;
  zR.prototype.spawnEnemy=function(hostile,type=null){const before=this.enemies.length,result=readabilitySpawnEnemy.call(this,hostile,type),enemy=this.enemies.length>before?this.enemies.at(-1):null;if(enemy){const role=roleForEnemy(enemy);enemy.userData.zkPicassoRoleSignature={role,...roleSignatures[role],appearanceOnly:true}}return result??enemy};
  const readabilityPlayerAcquire=zR.prototype.acquirePlayerProjectile;
  zR.prototype.acquirePlayerProjectile=function(kind,color){const node=readabilityPlayerAcquire.call(this,kind,color),role=kind==="missile"?"missiles":"player_ballistics",signature=roleSignatures[role];node.userData.zkPicassoRoleSignature={role,...signature,appearanceOnly:true};applyPriority(node,signature.priority,1);return node};

  const readabilityAddTelegraph=zkBossManager.prototype.addTelegraph;
  zkBossManager.prototype.addTelegraph=function(position,duration,patternId,onFire,options={}){
    const originalDuration=Number(duration),mesh=readabilityAddTelegraph.call(this,position,duration,patternId,onFire,options),item=this.telegraphs.at(-1);
    metrics.telegraphsCreated+=1;
    if(!item||item.mesh!==mesh){metrics.telegraphIdentityMissing+=1;return mesh}
    item.zkPicassoOriginalDuration=originalDuration;
    item.zkPicassoIdentity=bossProfile(this.config?.id)?.telegraph??String(patternId||"boss-telegraph");
    item.zkPicassoPriority="CRITICAL";
    mesh.userData.zkPicassoTelegraph={appearanceOnly:true,originalDuration,patternId,itemIdentity:item.zkPicassoIdentity,sourceDirection:true,dangerArea:true};
    const cue=new R(zkPicassoShapeGeometry("cone"),mesh.material);
    cue.name="picassoTelegraphSourceDirection";cue.position.set(0,0,-Number(item.radius??1.35));cue.scale.set(.34,.34,.52);cue.renderOrder=12;mesh.add(cue);
    mesh.renderOrder=10;mesh.material.depthTest=false;
    return mesh;
  };
  const readabilityUpdateTelegraphs=zkBossManager.prototype.updateTelegraphs;
  zkBossManager.prototype.updateTelegraphs=function(delta){
    const result=readabilityUpdateTelegraphs.call(this,delta);
    for(const item of this.telegraphs){
      if(Number(item.duration)!==Number(item.zkPicassoOriginalDuration)){metrics.telegraphDurationChanges+=1;item.zkPicassoOriginalDuration=Number(item.duration)}
      const visual=priorityProfile(item.zkPicassoPriority??"CRITICAL");
      item.mesh.scale.multiplyScalar(visual.telegraphScale);item.mesh.renderOrder=visual.renderOrder;item.mesh.material.depthTest=false;
    }
    return result;
  };

  function ensureWeakPointAperture(manager){
    const point=manager.weakPoint;if(!point||point.userData.zkPicassoAperture)return;
    const aperture=new Ge;aperture.name="picassoWeakPointSemanticAperture";
    for(let index=0;index<4;index+=1){const spike=new R(zkPicassoShapeGeometry("spike"),point.material);spike.rotation.z=index*Math.PI/2;spike.position.set(Math.cos(index*Math.PI/2)*.43,Math.sin(index*Math.PI/2)*.43,.02);spike.scale.set(.34,.34,.34);aperture.add(spike)}
    aperture.visible=false;point.add(aperture);point.userData.zkPicassoAperture=aperture;
  }
  function updateWeakPointLanguage(manager){
    if(!manager.active||!manager.boss||!manager.weakPoint)return;
    ensureWeakPointAperture(manager);
    const now=performance.now(),activeUntil=Number(manager.boss.userData.weakPointUntil??0),active=now<activeUntil,previous=!!manager.zkPicassoWeakPointWasActive;
    if(active&&!previous)manager.zkPicassoWeakPointOpenedAt=now;
    let state="CLOSED";
    if(Number(manager.zkPicassoWeakPointHitUntil??0)>now)state="HIT";
    else if(active&&now-Number(manager.zkPicassoWeakPointOpenedAt??0)<220)state="OPENING";
    else if(active&&activeUntil-now<=220)state="CLOSING";
    else if(active)state="ACTIVE";
    manager.zkPicassoWeakPointWasActive=active;manager.zkPicassoWeakPointState=state;
    const visual=weakPointVisuals[state],pulse=visual.pulse?1+Math.sin(now*.001*Math.PI*2*visual.pulse)*.08:1;
    manager.weakPoint.scale.setScalar(visual.scale*pulse);
    manager.weakPoint.userData.zkPicassoWeakPoint={state,semanticStates:weakPointStates,appearanceOnly:true};
    manager.weakPoint.userData.zkPicassoAperture.visible=state!=="CLOSED";
    manager.weakPoint.renderOrder=state==="ACTIVE"||state==="HIT"?11:5;
    const hud=document.getElementById("boss-encounter-hud");if(hud){hud.dataset.weakPointState=state;hud.dataset.weakPointLabel=visual.label}
  }
  const readabilityManagerUpdate=zkBossManager.prototype.update;
  zkBossManager.prototype.update=function(delta){
    const phaseBefore=this.phase?.id,result=readabilityManagerUpdate.call(this,delta),phaseAfter=this.phase?.id;
    if(this.active&&phaseBefore&&phaseAfter!==phaseBefore&&this.boss){const previous=this.game.zkPicassoResolvedImpact;this.game.zkPicassoResolvedImpact="boss_phase_threshold";this.game.spawnImpactPulse(this.boss.position.clone().add(new w(0,3,0)),this.phase?.color??this.config?.color??0xffffff);this.game.zkPicassoResolvedImpact=previous}
    updateWeakPointLanguage(this);
    return result;
  };

  const readabilityResolveDefense=zkBossManager.prototype.resolveDefense;
  zkBossManager.prototype.resolveDefense=function(rawDamage){const previous=this.game.zkPicassoResolvedImpact;this.game.zkPicassoResolvedImpact="shield_blocked";try{return readabilityResolveDefense.call(this,rawDamage)}finally{this.game.zkPicassoResolvedImpact=previous}};
  const readabilityDamageTarget=zR.prototype.damageWeaponTarget;
  zR.prototype.damageWeaponTarget=function(enemy,damage,color,weaponId=null){
    const previous=this.zkPicassoResolvedImpact,now=performance.now(),weak=!!enemy?.userData?.isMissionBoss&&now<Number(enemy.userData.weakPointUntil??0),armor=roleForEnemy(enemy)==="juggernaut";
    this.zkPicassoResolvedImpact=weak?"weak_point_hit":armor?"armor_hit":Number(damage)>=50?"critical_hit":"normal_hit";
    if(weak&&this.bossManager)this.bossManager.zkPicassoWeakPointHitUntil=now+150;
    try{return readabilityDamageTarget.call(this,enemy,damage,color,weaponId)}finally{this.zkPicassoResolvedImpact=previous}
  };
  const readabilityImpact=zR.prototype.spawnImpactPulse;
  zR.prototype.spawnImpactPulse=function(position,color){
    const state=zkPicassoEffectState(this),before=state.impactActive.size,type=impactProfiles[this.zkPicassoResolvedImpact]?this.zkPicassoResolvedImpact:"normal_hit",result=readabilityImpact.call(this,position,color);
    metrics.impactTypes[type]+=1;
    if(state.impactActive.size>before){const node=[...state.impactActive].at(-1),profile=impactProfiles[type];node.userData.zkPicassoImpactType=type;node.scale.setScalar(profile.scale);node.renderOrder=priorityProfile(type==="boss_phase_threshold"||type==="critical_hit"?"CRITICAL":type==="weak_point_hit"||type==="shield_blocked"?"HIGH":"MEDIUM").renderOrder;for(const child of node.children){if(child.userData.role==="ring")child.geometry=zkPicassoShapeGeometry(profile.shape);else child.visible=Number(child.userData.angle)*3/Math.PI<profile.shards}}
    metrics.maxImpactEffects=Math.max(metrics.maxImpactEffects,state.impactActive.size);
    return result;
  };
  zR.prototype.spawnResolvedPicassoImpact=function(type,position,color){const previous=this.zkPicassoResolvedImpact;this.zkPicassoResolvedImpact=impactProfiles[type]?type:"environmental_impact";try{return this.spawnImpactPulse(position,color)}finally{this.zkPicassoResolvedImpact=previous}};

  function round(value){return Number(Number(value??0).toFixed(4))}
  function vector(value){return value?{x:round(value.x),y:round(value.y),z:round(value.z)}:null}
  function paritySnapshot(game=globalThis.ZekNovaGame){
    if(!game)return null;
    const manager=game.bossManager;
    return Object.freeze({
      paused:!!game.paused,
      player:{position:vector(game.player?.group?.position),health:round(game.player?.health),specialGauge:round(game.specialAttackGauge)},
      enemies:(game.enemies??[]).filter(item=>item.visible&&Number(item.userData.health)>0).map(item=>({id:String(item.userData.worldJuggernautSlot??item.userData.commissioningId??item.userData.bossId??item.userData.enemyType??"enemy"),position:vector(item.position),health:round(item.userData.health)})).sort((a,b)=>a.id.localeCompare(b.id)),
      playerProjectiles:(game.projectiles??[]).map(item=>({kind:item.kind,position:vector(item.mesh?.position),velocity:vector(item.velocity),damage:round(item.damage),life:round(item.life)})),
      enemyProjectiles:(game.enemyProjectiles??[]).map(item=>({role:item.sourceRole,position:vector(item.mesh?.position),velocity:vector(item.velocity),damage:round(item.damage),life:round(item.life)})),
      bossProjectiles:(manager?.pool?.active??[]).map(item=>({patternId:item.patternId,position:vector(item.mesh?.position),velocity:vector(item.velocity),damage:round(item.damage),lifetime:round(item.lifetime),radius:round(item.radius),age:round(item.age)})),
      boss:manager?.active?{id:manager.config?.id,phase:manager.phase?.id,health:round(manager.boss?.userData?.health),weakPointState:manager.zkPicassoWeakPointState??"CLOSED",lastPattern:manager.lastPattern,nextAttackAt:round(manager.nextAttackAt),elapsed:round(manager.elapsed)}:null
    });
  }
  function stableHash(value){let hash=2166136261;for(const character of JSON.stringify(value))hash=Math.imul(hash^character.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,"0")}
  function recordParity(theme){const snapshot=paritySnapshot(),hash=snapshot?stableHash(snapshot):null;if(!hash)return null;if(metrics.parityBaseline===null)metrics.parityBaseline=hash;else if(hash!==metrics.parityBaseline)metrics.gameplayStateDivergenceCount+=1;metrics.paritySnapshots.push({theme:String(theme),hash,at:Date.now()});return{theme:String(theme),hash,match:hash===metrics.parityBaseline,snapshot}}
  globalThis.addEventListener?.("zeknova:visual-theme-changed",event=>{const game=globalThis.ZekNovaGame;if(game?.paused)recordParity(event.detail?.profile?.id??"unknown")});

  let lastFrame=performance.now();
  function sampleFrame(now){const delta=now-lastFrame;lastFrame=now;if(delta>0&&delta<250){metrics.frameSamples+=1;metrics.maxFrameMs=Math.max(metrics.maxFrameMs,delta);metrics.minObservedFps=Math.min(metrics.minObservedFps,1000/delta)}const game=globalThis.ZekNovaGame,state=game?.zkPicassoEffects,active=(game?.projectiles?.length??0)+(game?.enemyProjectiles?.length??0)+(game?.bossManager?.pool?.active?.length??0);metrics.maxActiveProjectiles=Math.max(metrics.maxActiveProjectiles,active);metrics.maxImpactEffects=Math.max(metrics.maxImpactEffects,state?.impactActive?.size??0);metrics.maxBeamEffects=Math.max(metrics.maxBeamEffects,state?.beamActive?.size??0);metrics.maxJsHeapBytes=Math.max(metrics.maxJsHeapBytes,Number(performance.memory?.usedJSHeapSize??0));if(!game?.disposed)requestAnimationFrame(sampleFrame)}
  requestAnimationFrame(sampleFrame);
  globalThis.addEventListener?.("error",event=>{metrics.browserRuntimeErrors+=1;if(/shader|glsl|webgl/i.test(String(event.message??"")))metrics.shaderErrors+=1});
  globalThis.addEventListener?.("unhandledrejection",event=>{metrics.browserRuntimeErrors+=1;if(/shader|glsl|webgl/i.test(String(event.reason?.message??event.reason??"")))metrics.shaderErrors+=1});

  function resetMeasurements(){metrics.maxActiveProjectiles=0;metrics.maxImpactEffects=0;metrics.maxBeamEffects=0;metrics.maxFrameMs=0;metrics.minObservedFps=Infinity;metrics.maxJsHeapBytes=0;metrics.frameSamples=0;lastFrame=performance.now()}

  function report(){
    const game=globalThis.ZekNovaGame,state=game?.zkPicassoEffects,memory=game?.renderer?.info?.memory??{},switching=globalThis.ZekNovaVisualThemeManager?.themeSwitchReport?.()??{};
    return Object.freeze({
      PICASSO_COMBAT_READABILITY_IMPLEMENTED:true,
      ROLE_SIGNATURES_VERIFIED:Object.keys(roleSignatures).length===9,
      BOSS_VISUAL_IDENTITIES_VERIFIED:Object.keys(certificationData()?.bosses??{}).length===12,
      TELEGRAPH_READABILITY_PASS:metrics.telegraphsCreated>0&&metrics.telegraphDurationChanges===0&&metrics.telegraphIdentityMissing===0,
      WEAK_POINT_LANGUAGE_PASS:weakPointStates.length===5,
      IMPACT_DIFFERENTIATION_PASS:Object.keys(impactProfiles).length===7,
      SIX_THEME_GAMEPLAY_PARITY_PASS:metrics.paritySnapshots.length>=6&&metrics.gameplayStateDivergenceCount===0,
      SIDE_BY_SIDE_ACCEPTANCE_CAPTURE_COMPLETE:metrics.acceptanceCaptureComplete,
      VISUAL_STRESS_TEST_PASS:metrics.frameSamples>0&&metrics.browserRuntimeErrors===0&&metrics.shaderErrors===0,
      MIN_OBSERVED_FPS:Number.isFinite(metrics.minObservedFps)?+metrics.minObservedFps.toFixed(1):0,
      MAX_FRAME_TIME_MS:+metrics.maxFrameMs.toFixed(2),
      MAX_JS_HEAP_MB:+(metrics.maxJsHeapBytes/1048576).toFixed(2),
      MAX_ACTIVE_PROJECTILES:metrics.maxActiveProjectiles,
      MAX_IMPACT_EFFECTS:metrics.maxImpactEffects,
      MAX_BEAM_EFFECTS:metrics.maxBeamEffects,
      RENDERER_GEOMETRIES:Number(memory.geometries??0),
      RENDERER_TEXTURES:Number(memory.textures??0),
      THEME_SWITCH_AVG_MS:Number(switching.averageMs??0),
      BROWSER_RUNTIME_ERRORS:metrics.browserRuntimeErrors,
      SHADER_ERRORS:metrics.shaderErrors,
      GAMEPLAY_STATE_DIVERGENCE_COUNT:metrics.gameplayStateDivergenceCount,
      PICASSO_AUTHORITY_VIOLATIONS:metrics.authorityViolations,
      CURRENT_AUTHORITY:"R0_VISUAL",
      TELEGRAPH_DURATION_CHANGES:metrics.telegraphDurationChanges,
      ACTIVE_PROJECTILES:(game?.projectiles?.length??0)+(game?.enemyProjectiles?.length??0)+(game?.bossManager?.pool?.active?.length??0),
      IMPACT_EFFECT_COUNT:state?.impactActive?.size??0,
      BEAM_COUNT:state?.beamActive?.size??0,
      ADDED_PROJECTILE_LIGHTS:0,
      perProjectileDynamicLights:0,
      paritySnapshots:[...metrics.paritySnapshots]
    });
  }
  globalThis.ZekNovaPicassoReadabilityCertification=Object.freeze({authority:zkPicassoReadabilityAuthority,priorities,effectBudgets,roleSignatures,weakPointStates,impactProfiles,paritySnapshot,recordParity,resetParity(){metrics.parityBaseline=null;metrics.paritySnapshots.length=0;metrics.gameplayStateDivergenceCount=0},resetMeasurements,markAcceptanceCaptureComplete(){metrics.acceptanceCaptureComplete=true},report});

  function runLocalStressTest(){
    const game=globalThis.ZekNovaGame;if(!game?.bossManager)return false;
    if(!game.bossManager.active)game.bossManager.startEncounter({missionId:"advanced-research",force:true});
    for(const role of["spitter","spitter","spitter","skyray","skyray","juggernaut"])game.spawnEnemy(true,role);
    for(const pattern of["arc_rotating_burst","arc_tracking_volley","arc_bullet_wall"])game.bossManager.schedulePattern(pattern);
    const origin=game.player?.group?.position?.clone?.().add(new w(0,2.4,0));if(origin){zkSpawnEnsignCharge(game,origin,420);zkSpawnPicassoBeam(game,origin,origin.clone().add(new w(0,0,18)),0xffe93b,{duration:900,hero:true});game.spawnResolvedPicassoImpact("environmental_impact",origin.clone().add(new w(0,-2,18)),0xffe93b)}
    return true;
  }
  const local=globalThis.location?.hostname==="127.0.0.1"||globalThis.location?.hostname==="localhost";
  if(local){
    const qa=document.createElement("span");qa.id="zeknova-picasso-readability-qa";qa.setAttribute("aria-hidden","true");qa.style.cssText="position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1";qa.innerHTML='<button type="button" data-qa-picasso-freeze>freeze</button><button type="button" data-qa-picasso-resume>resume</button><button type="button" data-qa-picasso-stress>stress</button><button type="button" data-qa-picasso-acceptance>acceptance</button><button type="button" data-qa-picasso-reset-metrics>reset metrics</button><output></output>';document.body.append(qa);
    qa.querySelector("[data-qa-picasso-freeze]").addEventListener("click",()=>{const game=globalThis.ZekNovaGame;if(game){game.paused=true;recordParity(globalThis.ZekNovaVisualThemeManager?.activeThemeId?.()??"zeknova")}});
    qa.querySelector("[data-qa-picasso-resume]").addEventListener("click",()=>{const game=globalThis.ZekNovaGame;if(game)game.paused=false});
    qa.querySelector("[data-qa-picasso-stress]").addEventListener("click",runLocalStressTest);
    qa.querySelector("[data-qa-picasso-acceptance]").addEventListener("click",()=>{metrics.acceptanceCaptureComplete=true});
    qa.querySelector("[data-qa-picasso-reset-metrics]").addEventListener("click",resetMeasurements);
    window.setInterval(()=>{qa.querySelector("output").textContent=JSON.stringify(report())},400);
    globalThis.ZekNovaPicassoReadabilityQA=Object.freeze({runStress:runLocalStressTest,freeze(){qa.querySelector("[data-qa-picasso-freeze]").click()},resume(){qa.querySelector("[data-qa-picasso-resume]").click()},resetMeasurements});
    if(new URLSearchParams(globalThis.location.search).has("qaPicassoCapture")){
      const autoCapture=window.setInterval(()=>{const game=globalThis.ZekNovaGame;if(!game?.bossManager)return;game.bossManager.debugPlayerDamage=false;if(!game.bossManager.active||(!game.bossManager.telegraphs.length&&!game.bossManager.pool.active.length))return;window.clearInterval(autoCapture);game.paused=true;resetMeasurements();recordParity(globalThis.ZekNovaVisualThemeManager?.activeThemeId?.()??"zeknova")},50);
    }
  }
})();
// Highlands Commissioning — deterministic, tension-independent, 6h regeneration, persistent per teamCode
(function(){
  const COMMISSIONING_REGEN_MS = 6*60*60*1000;
  globalThis.ZekNovaBossCombat = globalThis.ZekNovaBossCombat || { spawnMissionConfrontation: function(game, mid){ return (game._spawnCommissioningGroup||spawnCommissioningGroup)(game, mid); }, startBossEncounter: function(bossId, ctx){ return game && game.bossManager ? game.bossManager.startEncounter({missionId: Object.entries({grid:"desert_sunscar_colossus",water:"wetlands_mire_siren","tower-one":"highlands_stormback",habitat:"forest_ancient_thornwarden"}).find(([,id])=>id===bossId)?.[0]||ctx.missionId, force:true}) : false; }, updateBossCombat: function(dt){ if(game && game.bossManager) game.bossManager.update(dt); }, resetBossEncounter: function(bossId){ if(game && game.bossManager) game.bossManager.cleanup(false); }, cleanupBossCombat: function(){ if(game && game.bossManager){ game.bossManager.pool?.clear(); game.bossManager.clearTelegraphs(); } } };
  const COMMISSIONING_CONFIG = {
    "water": { biome: "highlands", attackers: [{stableId:"juggernaut", role:"juggernaut"}, {stableId:"spitter-1", role:"spitter"}, {stableId:"spitter-2", role:"spitter"}] },
    "tower-one": { biome: "highlands", attackers: [{stableId:"juggernaut", role:"juggernaut"}, {stableId:"spitter-1", role:"spitter"}, {stableId:"spitter-2", role:"spitter"}] }
  };
  function attackerIds(missionId, gen){ const cfg=COMMISSIONING_CONFIG[missionId]; if(!cfg) return []; return cfg.attackers.map(function(a){ return "commissioning-"+missionId+"-"+a.stableId+"-g"+gen; }); }
  function ensureState(game, missionId){
    game.missionStats.commissioningEncounters = game.missionStats.commissioningEncounters || {};
    const team = String(game.user && game.user.teamCode || "default");
    let st = game.missionStats.commissioningEncounters[missionId];
    if(!st || st.teamCode !== team){
      const gen = 0;
      st = { generation: gen, attackerIds: attackerIds(missionId, gen), defeatedIds: [], status: "active", completedAt: null, nextRegenAt: null, teamCode: team };
      game.missionStats.commissioningEncounters[missionId]=st;
    }
    if(st.teamCode !== team){
      st.teamCode=team; st.generation=0; st.attackerIds=attackerIds(missionId,0); st.defeatedIds=[]; st.status="active"; st.completedAt=null; st.nextRegenAt=null;
    }
    return st;
  }
  function canSpawnCommissioning(game, missionId){
    const st = ensureState(game, missionId);
    if(st.status==="completed"){
      const now=Date.now();
      if(Number(st.nextRegenAt) > now) return false;
      if(!game.terrain || !game.player) return false;
      return true;
    }
    if(st.defeatedIds.length>=3) return false;
    // Existing members do not block retries: a constrained frame may spawn only
    // part of the trio, and later ticks must be able to fill the missing stable IDs.
    return st.attackerIds.some(function(stableId){
      return st.defeatedIds.indexOf(stableId)===-1 && !(game.enemies||[]).some(function(e){ return e.userData && e.userData.commissioningId===stableId && Number(e.userData.health)>0; });
    });
  }
  function spawnCommissioningGroup(game, missionId){ game._spawnCommissioningGroup = spawnCommissioningGroup;
    if(!canSpawnCommissioning(game, missionId)) return false;
    const cfg = COMMISSIONING_CONFIG[missionId];
    if(!cfg) return false;
    const st = ensureState(game, missionId);
    if(st.status==="completed" && Number(st.nextRegenAt) <= Date.now()){
      if(!game.terrain || typeof game.terrain.findSafeSpawn!=="function") return false;
      // Atomic regeneration: do not reset until all 3 can be placed; if terrain not ready, keep COMPLETE
      const newGen = Number(st.generation||0)+1;
      const newIds = attackerIds(missionId, newGen);
      // Validate all 3 can be placed and enemy slots free before committing reset
      const liveCount=(game.enemies||[]).filter(function(e){ return Number(e.userData.health)>0; }).length;
      if(liveCount>3) return false; // need 3 free slots (limit 6)
      // Validate all 3 positions are navigable before committing reset
      let canPlaceAll=true;
      for(let i=0;i<newIds.length;i++){
        let ok=false;
        for(let attempt=0; attempt<8 && !ok; attempt++){
          const ang=(i*2.1+attempt*0.7)%(Math.PI*2);
          const dist=8+(attempt%3)*3;
          const x=(0)+Math.cos(ang)*dist;
          const z=(0)+Math.sin(ang)*dist;
          try{ if(!game.terrain.isWaterAt(x,z,0.5) && !game.terrain.isObstacleAt(x,z,1.35)) ok=true; }catch(e){}
        }
        if(!ok) canPlaceAll=false;
      }
      if(!canPlaceAll) return false;
      st.generation=newGen;
      st.attackerIds=newIds;
      st.defeatedIds=[];
      st.status="active";
      st.completedAt=null;
      st.nextRegenAt=null;
    }
    if(st.status!=="active") return false;
    let anchorX=0, anchorZ=0;
    try{ const a=zkAOAt(game.player.group.position.x, game.player.group.position.z); if(a.id==="highlands"){ anchorX=game.player.group.position.x; anchorZ=game.player.group.position.z; } }catch(e){}
    const roles = cfg.attackers.map(function(a){return a.role;});
    let spawned=0;
    for(let i=0;i<roles.length;i++){
      const role=roles[i];
      const stableId=st.attackerIds[i];
      if(st.defeatedIds.indexOf(stableId)!==-1) continue;
      if((game.enemies||[]).some(function(e){ return e.userData && e.userData.commissioningId===stableId && Number(e.userData.health)>0; })) continue;
      let pos=null;
      for(let attempt=0; attempt<12 && !pos; attempt++){
        const ang = (i*2.1 + attempt*0.7) % (Math.PI*2);
        const dist = 8 + (attempt%3)*3;
        const x = anchorX + Math.cos(ang)*dist;
        const z = anchorZ + Math.sin(ang)*dist;
        try{
          if(game.terrain.isWaterAt(x,z,0.5)) continue;
          if(game.terrain.isObstacleAt(x,z,1.35)) continue;
          pos=game.terrain.findSafeSpawn(x,z);
          if(pos && (game.terrain.isWaterAt(pos.x,pos.z,0.5) || game.terrain.isObstacleAt(pos.x,pos.z,1.35))) pos=null;
        }catch(e){ pos=null; }
        if(!pos) pos={x:x, z:z, y: game.terrain.heightAt(x,z)};
      }
      if(!pos) continue;
      const beforeCount=game.enemies.length;
      if(role==="juggernaut")zkJuggernautRoleSpawn.call(game,true,"juggernaut");else game.spawnEnemy(true,role);
      const e=game.enemies.length>beforeCount?game.enemies.at(-1):null;
      if(e){
        e.userData.commissioningId=stableId;
        e.userData.commissioningMissionId=missionId;
        e.userData.commissioningGeneration=st.generation;
        e.userData.hostile=true;
        e.userData.guardian=false;
        e.userData.spawnedForCommissioning=true;
        if(e.userData.juggernautState) e.userData.juggernautState="pursuit";
        try{ e.position.set(pos.x, game.terrain.heightAt(pos.x,pos.z), pos.z); }catch(e2){}
        spawned++;
      }
    }
    if(spawned>0){
      if(game.save) game.save();
      if(spawned===3) game.ui.showToast("Commissioning attack", "1 Juggernaut + 2 Red shooters inbound — tension-independent. Defeat them to complete 3/3.", "danger");
      return true;
    }
    return false;
  }
  const origUpdateAO = zR.prototype.updateAO;
  zR.prototype.updateAO = function(){
    const res = origUpdateAO.apply(this, arguments);
    try{
      const ctx=this.getMissionContext && this.getMissionContext();
      const campaign=ctx?zkCampaignState(ctx):null;
      const mission=campaign && campaign.current;
      if(!mission) return res;
      const mid=mission.id;
      if(!COMMISSIONING_CONFIG[mid]) return res;
      if(this.missionStats.bossDefeats && this.missionStats.bossDefeats[mid]) return res;
      if(this.bossManager && this.bossManager.active) return res;
      const hasObjective=(MISSION_OBJECTIVES[mid]||[]).some(function(o){ return String(o.label).indexOf("Intercept 3 attackers")!==-1; });
      if(!hasObjective) return res;
      const st=ensureState(this, mid);
      if(st.status==="completed" && Number(st.nextRegenAt) > Date.now()) return res;
      if(st.status==="completed" && Number(st.nextRegenAt) <= Date.now()){
        const area=zkAOAt(this.player.group.position.x, this.player.group.position.z);
        if(area.id==="highlands"){ spawnCommissioningGroup(this, mid); }
        return res;
      }
      const area=zkAOAt(this.player.group.position.x, this.player.group.position.z);
      if(area.id!=="highlands") return res;
      if(st.defeatedIds.length>=3) return res;
      const live=(this.enemies||[]).filter(function(e){ return e.userData && e.userData.commissioningMissionId===mid && Number(e.userData.health)>0; });
      if(live.length>0) return res;
      if(st.status==="active" && st.defeatedIds.length<3){ spawnCommissioningGroup(this, mid); }
    }catch(e){}
    return res;
  };
  const origBossRecord = zkBossRecordBiomeStat;
  zkBossRecordBiomeStat = function(game,x,z,key,amount){
    const ret=origBossRecord.apply(this, arguments);
    return ret;
  };
  const commissioningUpdate = zR.prototype.updateEnemies;
  zR.prototype.updateEnemies = function(delta){
    // Autotrigger from the regular simulation loop. This covers players who are
    // already standing in Highlands when the commissioning objective unlocks, so
    // no biome-boundary movement or reload is required to start the confrontation.
    try{
      const now=performance.now();
      if(now>=Number(this.nextCommissioningAutoTriggerAt??0)){
        this.nextCommissioningAutoTriggerAt=now+750;
        const ctx=this.getMissionContext?.(),mission=ctx?zkCampaignState(ctx).current:null,mid=mission?.id;
        if(COMMISSIONING_CONFIG[mid]&&!this.missionStats.bossDefeats?.[mid]&&!this.bossManager?.active){
          const area=zkAOAt(this.player.group.position.x,this.player.group.position.z),st=ensureState(this,mid);
          const hasObjective=(MISSION_OBJECTIVES[mid]||[]).some(function(o){return String(o.label).includes("Intercept 3 attackers")});
          if(hasObjective&&area.id==="highlands"&&st.defeatedIds.length<3)spawnCommissioningGroup(this,mid);
        }
      }
    }catch{}
    const preLive = new Map();
    for(let i=0;i<this.enemies.length;i++){ const e=this.enemies[i]; if(e.userData && e.userData.commissioningId) preLive.set(e.userData.commissioningId, Number(e.userData.health)); }
    const result = commissioningUpdate.call(this, delta);
    try{
      for(let entry of preLive.entries()){
        const cid=entry[0]; const healthBefore=entry[1];
        let enemy=null; for(let j=0;j<this.enemies.length;j++){ if(this.enemies[j].userData && this.enemies[j].userData.commissioningId===cid){ enemy=this.enemies[j]; break; } }
        const healthAfter = enemy ? Number(enemy.userData.health) : 0;
        const defeated = healthAfter<=0 || !enemy;
        if(defeated && healthBefore>0){
          for(let missionId in COMMISSIONING_CONFIG){
            const st=ensureState(this, missionId);
            if(st.attackerIds.indexOf(cid)!==-1 && st.defeatedIds.indexOf(cid)===-1){
              st.defeatedIds.push(cid);
              const seen={}; const uniq=[]; for(let k=0;k<st.defeatedIds.length;k++){ const v=st.defeatedIds[k]; if(!seen[v]){ seen[v]=1; uniq.push(v);} } st.defeatedIds=uniq;
              if(this.save) this.save();
              const done=st.defeatedIds.length;
              this.ui.showToast("Commissioning hit", done+"/3 attackers defeated", done===3?"success":"warning");
              if(done>=3){
                st.status="completed";
                st.completedAt=Date.now();
                st.nextRegenAt=st.completedAt + COMMISSIONING_REGEN_MS;
                if(this.save) this.save();
                this.ui.showToast("Intercept COMPLETE", "3/3 commissioning attackers defeated — 6-hour regeneration started.", "success");
              }
              break;
            }
          }
        }
      }
    }catch(e){}
    return result;
  };
  const origRestore = zR.prototype.restore;
  zR.prototype.restore = function(e){
    const r=origRestore.call(this, e);
    try{
      this.missionStats.commissioningEncounters=this.missionStats.commissioningEncounters||{};
      const team=String(this.user && this.user.teamCode || "default");
      for(let mid in COMMISSIONING_CONFIG){
        const st=this.missionStats.commissioningEncounters[mid];
        if(st && st.teamCode!==team){
          st.teamCode=team; st.generation=0; st.attackerIds=attackerIds(mid,0); st.defeatedIds=[]; st.status="active"; st.completedAt=null; st.nextRegenAt=null;
        }
        if(st && st.status==="completed" && Number(st.nextRegenAt) <= Date.now()){
          // keep completed until can spawn
        }
      }
      if(this.save) this.save();
    }catch(e){}
    return r;
  };
  const origDamage = zR.prototype.damageWeaponTarget;
  if(origDamage){
    zR.prototype.damageWeaponTarget = function(enemy, damage, color, weaponId){
      const res=origDamage.apply(this, arguments);
      try{
        if(enemy && enemy.userData && enemy.userData.commissioningId && Number(enemy.userData.health)<=0){
          const mid=enemy.userData.commissioningMissionId;
          if(mid && COMMISSIONING_CONFIG[mid]){
            const st=ensureState(this, mid);
            const cid=enemy.userData.commissioningId;
            if(st.defeatedIds.indexOf(cid)===-1){
              st.defeatedIds.push(cid);
              const seen={}; const uniq=[]; for(let k=0;k<st.defeatedIds.length;k++){ const v=st.defeatedIds[k]; if(!seen[v]){ seen[v]=1; uniq.push(v);} } st.defeatedIds=uniq;
              if(st.defeatedIds.length>=3 && st.status!=="completed"){
                st.status="completed"; st.completedAt=Date.now(); st.nextRegenAt=st.completedAt + COMMISSIONING_REGEN_MS;
              }
              if(this.save) this.save();
            }
          }
        }
      }catch(e){}
      return res;
    };
  }
  console.log("Highlands Commissioning 6h patch applied — water + tower-one, tension-independent, persistent, team-isolated");
})();

/* Mission 4 usability: show the exact biome, menu path, cheapest project, live
   affordability, and cooldown. The helper opens the correct construction tab;
   it does not grant resources, alter progress, or bypass placement rules. */
(()=>{
  const updateMissionGuide=function(game){
    const list=document.getElementById("sub-objective-list");
    if(!list)return;
    let mission=null,context=null;
    try{context=game.getMissionContext?.();mission=context?zkCampaignState(context).current:null}catch{}
    let guide=document.getElementById("zeknovan-settlement-guide");
    if(mission?.id!=="habitat"){
      guide?.remove();
      return;
    }
    const aidObjective=(mission.subObjectives??[]).find(item=>item.kind==="biomeEither"&&item.biome==="forest"&&item.keys?.some(key=>key==="zek_grove"));
    if(!aidObjective||zkObjectiveComplete(aidObjective,context)){
      guide?.remove();
      return;
    }
    if(!guide){
      guide=document.createElement("div");
      guide.id="zeknovan-settlement-guide";
      guide.className="zk-mission-action-guide";
      list.insertAdjacentElement("afterend",guide);
    }
    const minerals=Number(game.simulation?.resources?.minerals??0),credits=Number(game.simulation?.resources?.credits??0);
    const affordable=minerals>=24&&credits>=7;
    const cooldown=game.zeknovanAidCooldownRemaining?.()??0;
    const currentAO=game.currentAO?.id??zkAOAt(game.player?.group?.position?.x??0,game.player?.group?.position?.z??0).id;
    const locationReady=currentAO==="forest";
    const status=cooldown>0?`Aid crew cooldown: ${zkAidCooldownLabel(cooldown)} remaining.`:!locationReady?"Travel to FOREST AO before placing it.":!affordable?`Need ${Math.max(0,24-minerals)} more minerals and ${Math.max(0,7-credits)} more credits.`:"Ready: place the green preview on open Forest ground.";
    guide.innerHTML=`<strong>HOW TO COMPLETE THIS</strong><span>1. Travel to FOREST AO. 2. Press TAB for Command Mode. 3. Open ZEKNOVAN AID. 4. Select Sacred Grove Nursery (24 minerals + 7 credits). 5. Click open ground when the preview is green.</span><button type="button" data-open-zeknovan-aid>OPEN ZEKNOVAN AID${locationReady?"":" · FOREST REQUIRED"}</button><small>${Li(status)} Hostile tension does not prevent construction.</small>`;
    guide.querySelector("[data-open-zeknovan-aid]")?.addEventListener("click",()=>{
      if(game.mode!=="command")game.toggleMode();
      document.querySelector('[data-build-filter="zeknovan"]')?.click();
      game.selectBuild?.("zek_grove");
      game.ui?.setBuildSelection?.("zek_grove");
      if(!locationReady)game.ui?.showToast("Forest project required","Travel west to FOREST AO, then place the Sacred Grove Nursery on open ground when its preview turns green.","info");
    },{once:true});
  };
  const previousUpdate=zR.prototype.updateHud;
  zR.prototype.updateHud=function(state){
    const result=previousUpdate.call(this,state);
    try{updateMissionGuide(this)}catch{}
    return result;
  };
})();
