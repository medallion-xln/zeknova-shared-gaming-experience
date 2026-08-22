/** Apply Picasso profiles to rendering only. No gameplay mutation surface. */
import { Group } from "../../assets/vendor/three.module.min.js";
import { Picasso, PICASSO_AUTHORITY, PICASSO_THEMES } from "./Picasso.js";
import { PicassoRuntimeStyleCompiler } from "./PicassoRuntimeStyleCompiler.js";
import { createVisualSceneContext } from "./VisualSceneContext.js";

const STORAGE_KEY="zeknova.visualTheme.v1",DEFAULT_THEME="zeknova";
const THEME_COSTS=Object.freeze({
  zeknova:Object.freeze({gpuCost:.52,postProcessCost:.18,splatCost:0,particleCost:.5}),
  anime:Object.freeze({gpuCost:.68,postProcessCost:.42,splatCost:.1,particleCost:.58}),
  cartoon:Object.freeze({gpuCost:.62,postProcessCost:.32,splatCost:.08,particleCost:.55}),
  cinematic:Object.freeze({gpuCost:.86,postProcessCost:.82,splatCost:.42,particleCost:.72}),
  ultra_realistic:Object.freeze({gpuCost:1,postProcessCost:.68,splatCost:.58,particleCost:.78}),
  alien_dream:Object.freeze({gpuCost:.92,postProcessCost:1,splatCost:1,particleCost:1}),
});
const TONE_MAPPING=Object.freeze({None:0,Linear:1,Reinhard:2,Cineon:3,ACESFilmic:4});
const VISUAL_TARGETS=Object.freeze({
  player:/player|officer|captain|lieutenant|ensign/i,
  settlement:/settlement|building|village|colony|habitat/i,
  drownedTremor:/drowned.?tremor|wetlands_drowned_tremor|boss.?arena/i,
  sporeCantor:/spore.?cantor|forest_spore_cantor|boss_projectile|projectile/i,
  arcGunner:/arc.?gunner|highlands_arc_gunner|electric|lightning|railgun/i,
});
function storedTheme(){try{const value=localStorage.getItem(STORAGE_KEY);return PICASSO_THEMES.includes(value)?value:DEFAULT_THEME}catch{return DEFAULT_THEME}}
function materialsOf(node){return Array.isArray(node?.material)?node.material:[node?.material].filter(Boolean)}
function visualKey(node){return `${node?.name||""} ${node?.userData?.type||""} ${node?.userData?.bossId||""} ${node?.userData?.patternId||""} ${node?.userData?.effect||""}`}

export class VisualThemeManager{
  authority=PICASSO_AUTHORITY;
  constructor({game,renderer,scene,router}={}){
    this.game=game||null;this.renderer=renderer||game?.renderer||null;this.scene=scene||game?.scene||null;this.router=router||null;
    this.currentTheme=storedTheme();this.appliedProfile=null;this.splatLayer=null;this._fallbackUsed=false;
    this._materialBaseline=new WeakMap();this._listeners=[];this._lastVerticalSlice=Object.freeze({});this._prepared=null;
    this.runtimeCompiler=new PicassoRuntimeStyleCompiler({renderer:this.renderer,scene:this.scene});this.compiledStyle=null;
    this.adaptiveQuality="Ultra";this.adaptiveScale=Object.freeze({outlineScale:1,postScale:1,splatScale:1,particleScale:1});
  }
  init(){try{this.applyTheme(this.currentTheme)}catch(error){console.warn("[VisualThemeManager] deterministic fallback",error);this._fallbackUsed=true;this.applyTheme(DEFAULT_THEME)}return this}
  themes(){return[...PICASSO_THEMES]} activeThemeId(){return this.currentTheme} activeProfile(){return this.appliedProfile}
  setTheme(id){const theme=String(id||DEFAULT_THEME).toLowerCase();if(!PICASSO_THEMES.includes(theme))throw new Error(`Unknown theme: ${id}`);try{localStorage.setItem(STORAGE_KEY,theme)}catch{}return this.applyTheme(theme)}
  applyTheme(id){this._assertR0();const began=globalThis.performance?.now?.()??0,context=createVisualSceneContext(this.game,id);const profile=this.router?.request?.({capability:"visual_style",theme:id,sceneContext:context})||Picasso.generateTheme(id,context);this.currentTheme=profile.id;this.appliedProfile=profile;this._applyRenderer(profile);this._lastVerticalSlice=this.refreshVerticalSlice(profile);this.compiledStyle=this.runtimeCompiler.apply(profile,context);if(this.adaptiveQuality!=="Ultra")this.runtimeCompiler.setPerformanceScale(this.adaptiveQuality,this.adaptiveScale);this._applySplatLayer(profile);this._notify(profile);this.prepareThemeAssets(profile.id,context);const elapsed=Math.max(0,(globalThis.performance?.now?.()??began)-began);this._lastThemeSwitchMs=elapsed;this._themeSwitchSamples??=[];this._themeSwitchSamples.push(elapsed);this._themeSwitchSamples=this._themeSwitchSamples.slice(-120);return profile}
  async prepareThemeAssets(theme=this.currentTheme,context={}){this._prepared=await Picasso.prepareTheme(theme,context);return this._prepared}
  _assertR0(){for(const [key,value] of Object.entries(this.authority))if(key.startsWith("can")&&value!==false)throw new Error(`VisualThemeManager R0 violation: ${key}`)}
  _applyRenderer(profile){const renderer=this.renderer,scene=this.scene;if(renderer){if("toneMapping" in renderer)renderer.toneMapping=TONE_MAPPING[profile.lighting.toneMapping]??TONE_MAPPING.ACESFilmic;if("toneMappingExposure" in renderer)renderer.toneMappingExposure=profile.lighting.exposure??1;renderer.userData=renderer.userData||{};renderer.userData.zkPicasso={theme:profile.id,backend:this.rendererBackend(),grading:profile.grading}}
    if(scene){scene.userData=scene.userData||{};scene.userData.zkVisualTheme=profile.id;scene.userData.zkShading=profile.shading;if(scene.fog){scene.fog.color?.setHex?.(profile.lighting.fogColor);if("density" in scene.fog)scene.fog.density=profile.lighting.fogDensity}}
  }
  _snapshot(material){if(this._materialBaseline.has(material))return this._materialBaseline.get(material);const state={roughness:material.roughness,metalness:material.metalness,emissiveIntensity:material.emissiveIntensity,flatShading:material.flatShading,opacity:material.opacity};this._materialBaseline.set(material,state);return state}
  _styleMaterial(material,profile,target){const base=this._snapshot(material),m=profile.material;if(typeof material.roughness==="number")material.roughness=Math.min(1,Math.max(0,m.roughness));if(typeof material.metalness==="number")material.metalness=Math.min(1,Math.max(0,m.metalness));if(typeof material.emissiveIntensity==="number")material.emissiveIntensity=(base.emissiveIntensity??1)*m.emissiveBoost;if("flatShading" in material)material.flatShading=!!m.flatShading;material.userData=material.userData||{};material.userData.zkPicasso={theme:profile.id,target,cel:profile.shading.cel,outlineWidth:profile.shading.outlineWidth,pbrIntensity:m.pbrIntensity};material.needsUpdate=true}
  refreshVerticalSlice(profile=this.appliedProfile){if(!profile||!this.scene?.traverse)return Object.freeze({});const counts={player:0,settlement:0,drownedTremor:0,sporeCantor:0,arcGunner:0,other:0};this.scene.traverse(node=>{if(!node?.material)return;const key=visualKey(node);const target=Object.entries(VISUAL_TARGETS).find(([,pattern])=>pattern.test(key))?.[0]||"other";materialsOf(node).forEach(material=>this._styleMaterial(material,profile,target));counts[target]+=1;node.userData=node.userData||{};node.userData.zkPicassoVisual={theme:profile.id,target,appearanceOnly:true,...(target==="sporeCantor"?{trail:profile.projectileTrails}:{}) ,...(target==="drownedTremor"||target==="arcGunner"?{bossVfx:profile.bossVfx}:{})}}
    );return Object.freeze(counts)}
  _applySplatLayer(profile){if(!this.splatLayer){this.splatLayer=new Group();this.splatLayer.name="PicassoScenerySplatLayer";this.splatLayer.userData={zkVisualOnly:true,sceneryOnly:true,authoritativeGeometry:false,collisionEnabled:false}}
    const enabled=!!profile.splat.enabled;this.splatLayer.visible=enabled;this.splatLayer.userData.profile=profile.splat;if(enabled&&this.scene&&this.splatLayer.parent!==this.scene)this.scene.add(this.splatLayer);if(!enabled&&this.splatLayer.parent)this.splatLayer.parent.remove(this.splatLayer)}
  addSplatScenery(object){if(!object)throw new TypeError("Splat scenery object required");object.userData={...(object.userData||{}),zkVisualOnly:true,sceneryOnly:true,authoritativeGeometry:false,collisionEnabled:false};this.splatLayer.add(object);return object}
  rendererBackend(){const r=this.renderer;if(r?.isWebGPURenderer||/webgpu/i.test(r?.backend?.constructor?.name||""))return"webgpu";if(r?.isWebGLRenderer||r?.getContext)return"webgl2";return"headless"}
  compatibility(){return Object.freeze({backend:this.rendererBackend(),webgpu:this.rendererBackend()==="webgpu",webgl2Fallback:true,diffusionPerFrame:false,particleCap:this.appliedProfile?.particles?.cap??120,combatVfx:this.appliedProfile?.combatVfx??null,splatAuthoritativeGeometry:false,compiledStyle:this.runtimeCompiler.report()})}
  costMetadata(theme=this.currentTheme){return Object.freeze({...((THEME_COSTS[theme])||THEME_COSTS.zeknova),theme,appearanceOnly:true})}
  setAdaptiveQuality(tier,scale={}){this._assertR0();this.adaptiveQuality=String(tier||"Ultra");this.adaptiveScale=Object.freeze({...this.adaptiveScale,...scale});this.runtimeCompiler.setPerformanceScale(this.adaptiveQuality,this.adaptiveScale);if(this.splatLayer)this.splatLayer.visible=!!this.appliedProfile?.splat?.enabled&&Number(this.adaptiveScale.splatScale??1)>0;this.scene&&(this.scene.userData.zkPicassoAdaptiveQuality={tier:this.adaptiveQuality,theme:this.currentTheme,cost:this.costMetadata(),particleScale:Number(this.adaptiveScale.particleScale??1),appearanceOnly:true});return Object.freeze({tier:this.adaptiveQuality,theme:this.currentTheme,scale:this.adaptiveScale,appearanceOnly:true})}
  createThemeSelector({mount}={}){if(typeof document==="undefined")return null;const el=document.createElement("div");el.className="zk-visual-theme-selector";el.dataset.testid="visual-theme-selector";el.innerHTML=`<label><span>Visual Style</span><select>${PICASSO_THEMES.map(id=>`<option value="${id}" ${id===this.currentTheme?"selected":""}>${Picasso.generateTheme(id).label}</option>`).join("")}</select></label><small>Picasso · R0 visual only</small>`;el.querySelector("select")?.addEventListener("change",event=>this.setTheme(event.target.value));mount?.appendChild(el);return el}
  async measureFrameBudget({durationMs=1000}={}){if(typeof requestAnimationFrame!=="function")return Object.freeze({fps:null,durationMs:0,heapBytes:globalThis.performance?.memory?.usedJSHeapSize??null,backend:this.rendererBackend()});const start=performance.now();let frames=0;await new Promise(resolve=>{const tick=now=>{frames+=1;if(now-start>=durationMs)resolve();else requestAnimationFrame(tick)};requestAnimationFrame(tick)});const elapsed=performance.now()-start;return Object.freeze({fps:+(frames*1000/elapsed).toFixed(1),durationMs:+elapsed.toFixed(1),heapBytes:performance.memory?.usedJSHeapSize??null,backend:this.rendererBackend(),rendererMemory:{...(this.renderer?.info?.memory||{})}})}
  verticalSliceReport(){return this._lastVerticalSlice} fallbackUsed(){return this._fallbackUsed} onThemeChange(fn){if(typeof fn==="function")this._listeners.push(fn);return()=>{this._listeners=this._listeners.filter(item=>item!==fn)}}
  _notify(profile){
    for(const fn of this._listeners)try{fn(profile)}catch{}
    if(typeof globalThis.dispatchEvent==="function"&&typeof CustomEvent==="function"){
      globalThis.dispatchEvent(new CustomEvent("zeknova:visual-theme-changed",{detail:{profile,materialProfile:profile.material,vfxProfile:{particles:profile.particles,projectileTrails:profile.projectileTrails,bossVfx:profile.bossVfx,combatVfx:profile.combatVfx},environmentProfile:{lighting:profile.lighting,grading:profile.grading,splat:profile.splat},appearanceOnly:true}}));
    }
  }
  compiledStyleReport(){return this.runtimeCompiler.report()}
  adaptiveReport(){return Object.freeze({tier:this.adaptiveQuality,theme:this.currentTheme,scale:this.adaptiveScale,cost:this.costMetadata(),selectedThemePreserved:true,appearanceOnly:true})}
  themeSwitchReport(){const samples=this._themeSwitchSamples??[];return Object.freeze({lastMs:+Number(this._lastThemeSwitchMs??0).toFixed(3),averageMs:samples.length?+(samples.reduce((sum,value)=>sum+value,0)/samples.length).toFixed(3):0,samples:samples.length})}
  reset(){Picasso.reset();this.runtimeCompiler.dispose();this.appliedProfile=null;this.compiledStyle=null;if(this.splatLayer?.parent)this.splatLayer.parent.remove(this.splatLayer)}
}
export default VisualThemeManager;
