const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:0;
const positionOf=(actor)=>actor?.position??actor?.group?.position??null;
const distance2=(a,b)=>{const dx=Number(a?.x)-Number(b?.x),dz=Number(a?.z)-Number(b?.z);return dx*dx+dz*dz};

export const RENDER_PERFORMANCE_POLICY=Object.freeze({
  residentHideDistance:46,residentShowDistance:40,enemyHideDistance:68,enemyShowDistance:60,
  shadowDistance:46,microShadowRadius:1.15,maxFrameSamples:1800,auditIntervalMs:500,
});

export function actorRenderDecision({distance,kind='resident',critical=false,visible=true},policy=RENDER_PERFORMANCE_POLICY){
  if(critical)return true;
  const hide=kind==='enemy'?policy.enemyHideDistance:policy.residentHideDistance;
  const show=kind==='enemy'?policy.enemyShowDistance:policy.residentShowDistance;
  return visible?distance<=hide:distance<show;
}

export class RenderPerformanceDirector{
  constructor({game,policy=RENDER_PERFORMANCE_POLICY,now=()=>performance.now()}={}){this.game=game;this.policy=policy;this.now=now;this.frames=[];this.lastFrame=0;this.original=new Map;this.hidden={residents:0,enemies:0};this.installed=false;this.audit={meshes:0,materials:0,triangles:0,shadowCasters:0,microShadowsDisabled:0};}
  install(){if(this.installed||!this.game)return this;this.installed=true;this.tick=this.tick.bind(this);this.frameHandle=requestAnimationFrame(this.tick);this.timer=setInterval(()=>this.optimize(),this.policy.auditIntervalMs);this.optimize();this.mountTelemetry();globalThis.ZekNovaRenderPerformance=Object.freeze({report:()=>this.report(),policy:this.policy,authority:'DETERMINISTIC_RENDER_ONLY'});return this}
  tick(now){if(!this.installed)return;if(this.lastFrame){const ms=Math.min(250,Math.max(0,now-this.lastFrame));this.frames.push(ms);if(this.frames.length>this.policy.maxFrameSamples)this.frames.shift()}this.lastFrame=now;this.frameHandle=requestAnimationFrame(this.tick)}
  critical(actor){const d=actor?.userData??{};return !!(d.isMissionBoss||d.bossId||d.missionCritical||d.commissioningId||d.isCommissioningAttacker||d.infrastructureCritical)}
  remember(object,key){let state=this.original.get(object);if(!state){state={};this.original.set(object,state)}if(!(key in state))state[key]=object[key]}
  setVisible(actor,value){this.remember(actor,'visible');actor.visible=value}
  optimizeActors(){const player=positionOf(this.game?.player);if(!player)return;this.hidden={residents:0,enemies:0};for(const[kind,list]of [['resident',this.game?.residentNPCs??[]],['enemy',this.game?.enemies??[]]])for(const actor of list){const pos=positionOf(actor);if(!pos)continue;const distance=Math.sqrt(distance2(pos,player)),visible=actor.visible!==false,next=actorRenderDecision({distance,kind,critical:this.critical(actor),visible},this.policy);this.setVisible(actor,next);if(!next)this.hidden[kind==='resident'?'residents':'enemies']++;if(!this.critical(actor)&&(kind==='resident'||distance>42))actor.traverse?.(object=>{if(object?.castShadow){this.remember(object,'castShadow');object.castShadow=false}})}}
  optimizeScene(){
    const scene=this.game?.scene,player=positionOf(this.game?.player);
    if(!scene?.traverse)return;
    const materials=new Set,geometries=new Set,textures=new Set;let meshes=0,triangles=0,casters=0,disabled=0;
    scene.traverse(object=>{
      if(!object?.isMesh)return;
      meshes++;object.frustumCulled=true;
      for(const material of(Array.isArray(object.material)?object.material:[object.material]))if(material){materials.add(material.uuid??material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value.uuid??value)}
      const geometry=object.geometry,index=geometry?.index?.count,vertices=geometry?.attributes?.position?.count;
      if(geometry)geometries.add(geometry.uuid??geometry);
      triangles+=Math.floor(Number(index??vertices??0)/3);
      if(!object.castShadow)return;
      casters++;
      if(this.critical(object)||object.isSkinnedMesh)return;
      const radius=Number(geometry?.boundingSphere?.radius??0),pos=object.position;
      const far=player&&pos&&distance2(pos,player)>this.policy.shadowDistance**2;
      if((radius>0&&radius<this.policy.microShadowRadius)||far){this.remember(object,'castShadow');object.castShadow=false;disabled++}
    });
    this.audit={meshes,geometries:geometries.size,materials:materials.size,textures:textures.size,triangles,shadowCasters:casters,microShadowsDisabled:disabled};
  }
  optimize(){this.optimizeActors();this.optimizeScene()}
  mountTelemetry(){if(typeof document==='undefined')return;this.node=document.getElementById('zeknova-render-performance-qa')||document.body.appendChild(document.createElement('span'));this.node.id='zeknova-render-performance-qa';this.node.setAttribute('aria-hidden','true');this.node.style.cssText='position:fixed;opacity:0;pointer-events:none;z-index:-1';this.telemetry=setInterval(()=>{this.node.textContent=JSON.stringify(this.report())},500)}
  resetRendererCounters(){const info=this.game?.renderer?.info;info?.reset?.();if(info?.render)for(const key of['calls','triangles','points','lines'])if(key in info.render)info.render[key]=0;return this}
  resetSamples(){this.frames.length=0;this.lastFrame=0;return this.resetRendererCounters()}
  report(){const sorted=[...this.frames].sort((a,b)=>a-b),sum=this.frames.reduce((a,b)=>a+b,0),renderer=this.game?.renderer?.info??{},counts=t=>this.frames.filter(v=>v>t).length;return Object.freeze({implemented:true,samples:this.frames.length,frame:{average:+(sum/Math.max(1,this.frames.length)).toFixed(2),median:+percentile(sorted,.5).toFixed(2),p95:+percentile(sorted,.95).toFixed(2),p99:+percentile(sorted,.99).toFixed(2),worst:+(sorted.at(-1)??0).toFixed(2),over16_7:counts(16.7),over33:counts(33),over50:counts(50),over100:counts(100)},renderer:{calls:Number(renderer.render?.calls??0),triangles:Number(renderer.render?.triangles??0),geometries:Number(renderer.memory?.geometries??0),textures:Number(renderer.memory?.textures??0)},hidden:{...this.hidden},scene:{...this.audit},active:{enemies:this.game?.enemies?.length??0,residents:this.game?.residentNPCs?.length??0,projectiles:(this.game?.projectiles?.length??0)+(this.game?.enemyProjectiles?.length??0)+(this.game?.bossManager?.pool?.active?.length??0)},authority:'DETERMINISTIC_RENDER_ONLY',gameplayStateMutated:false})}
  dispose(){this.installed=false;if(this.frameHandle&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.frameHandle);clearInterval(this.timer);clearInterval(this.telemetry);for(const[object,state]of this.original)for(const[key,value]of Object.entries(state))object[key]=value;this.original.clear();this.node?.remove();if(globalThis.ZekNovaRenderPerformance)delete globalThis.ZekNovaRenderPerformance}
}
export default RenderPerformanceDirector;
