import { Picasso, PICASSO_CAPABILITIES } from "./Picasso.js";
const VISUAL=new Set(PICASSO_CAPABILITIES);
const FORBIDDEN=new Set(["combat_strategy","mission_progression","npc_control","world_mutation","physics","collision","economy","save_state","multiplayer_sync"]);
export class SentinelExpertRouter{
  constructor(){this.experts=new Map()}
  register(expert){if(!expert?.id||typeof expert.canHandle!=="function")throw new TypeError("Invalid Sentinel expert");this.experts.set(expert.id,expert);return this}
  registry(){return[...this.experts.values()].map(expert=>Object.freeze({id:expert.id,capabilities:[...expert.capabilities],authority:expert.authority}))}
  route(request={}){const capability=String(request.capability||request.type||"");if(FORBIDDEN.has(capability)||!VISUAL.has(capability))return null;const expert=[...this.experts.values()].find(item=>item.canHandle(request));return expert?Object.freeze({expertId:expert.id,expert,capability}):null}
  request(request={}){const route=this.route(request);if(!route)throw new Error(`No visual-only Sentinel expert route for ${String(request.capability||request.type||"request")}`);return route.expert.generateTheme(request.theme,request.sceneContext)}
  dispatchGameplay(){throw new Error("Sentinel visual router has no gameplay dispatch authority")}
}
export function createSentinelVisualRouter(){return new SentinelExpertRouter().register(Picasso)}
