import {MovementSampler} from './MovementSampler.js';
import { createGameplaySession } from './gameplay-session.js';
import { createServerGameplaySession } from './server-session.js';
import { createGameplayScene } from './scene.js';
const serverMode = new URLSearchParams(location.search).get('server') === '1';
let auth = null; try { auth = JSON.parse(sessionStorage.getItem('zge.staging.auth')); } catch {}
let session;
while (serverMode && !session) {
  if (!auth) {
    document.querySelector('#server-auth').hidden = false;
    await new Promise(resolve => document.querySelector('#connect-server').addEventListener('click', () => {
      auth = {worldId:document.querySelector('#server-world').value,token:document.querySelector('#server-token').value};
      document.querySelector('#server-token').value='';document.querySelector('#server-auth').hidden=true;resolve();
    }, {once:true}));
  }
  try { session=await createServerGameplaySession({auth,storage:sessionStorage});sessionStorage.setItem('zge.staging.auth',JSON.stringify(auth)); }
  catch(error){auth=null;sessionStorage.removeItem('zge.staging.auth');document.querySelector('#status').textContent='Connection failed: '+error.message;}
}
if(!serverMode)session=await createGameplaySession({storage:localStorage});
const canvas = document.querySelector('#world');
if(serverMode&&session.client.identity.role==='viewer'){for(const id of['place','invalid','remove','type'])document.querySelector('#'+id).disabled=true;}
if(serverMode){document.querySelector('#ownership').textContent='Server ENGINE authority · acknowledged SQLite commits · isolated staging';document.querySelector('#grant').disabled=true;document.querySelector('#second').disabled=true;document.querySelector('#save').textContent='Confirm server save';document.querySelector('#restore').textContent='Reconnect';}

if(serverMode){
 const bar=document.createElement('div');bar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:12px';
 bar.innerHTML='<button id="disconnect-server">Disconnect</button> <input id="refresh-secret" type="password" autocomplete="off" aria-label="Private reauthentication credential" style="width:320px;max-width:100%" placeholder="Private reauthentication credential"> <button id="reauth-server">Reauthenticate</button>';
 document.querySelector('#status').before(bar);
 bar.querySelector('#disconnect-server').onclick=()=>action(()=>session.disconnect());
 bar.querySelector('#reauth-server').onclick=()=>{const field=bar.querySelector('#refresh-secret'),secret=field.value;field.value='';return action(()=>session.reauthenticate(secret));};
}
if(serverMode&&session.client.view.schema==='zge.multiplayer-view.v1'){
 const button=document.querySelector('#second'),panel=button.closest('.panel');button.hidden=true;panel.querySelector('h2').textContent='Officers in this world';panel.querySelector('p').id='peer-list';
 document.querySelector('.instructions').textContent='Your officer is gold; other officers are blue. Rocks, water, and structures block movement.';
}
let moving = false;
let scene = await createGameplayScene(canvas, session), frame = null, disposed = false, lastMove = 0, restarting = false;
const keys = new Set(), listeners = [], frames = [];
const listen = (target, type, handler) => { target.addEventListener(type, handler); listeners.push(() => target.removeEventListener(type, handler)); };
const message = value => { document.querySelector('#status').textContent = typeof value === 'string' ? value : JSON.stringify(value); };
function inspect() {
  const state = session.inspect();
  const peers=document.querySelector('#peer-list');if(peers)peers.textContent=(state.players??[]).filter(p=>p.id!==state.player.id).map(p=>p.playerId+' · '+p.rank).join(' | ')||'Other authenticated officers appear here in blue.';
  document.querySelector('#inventory').textContent = state.world.inventory.stone + ' stone';
  document.querySelector('#mission').textContent = state.mission.status === 'complete' ? 'Colony established' : `Build two structures · ${Math.min(state.built, 2)}/2`;
  document.querySelector('#progress').style.width = Math.min(state.built / 2, 1) * 100 + '%';
  document.querySelector('#reward').textContent = `Officer XP · ${state.player.xp} / ${state.team?'team XP · '+state.team.xp:'reward · 25 XP, once'}`;
  document.querySelector('#building').replaceChildren(...state.world.buildings.map(b => { const option = document.createElement('option'); option.value = b.id; option.textContent = `${b.type} at (${b.x}, ${b.z})`; return option; }));
  document.querySelector('#result').textContent = JSON.stringify({ authority: state.world.authority, revision: state.world.revision, inventoryRevision: state.world.inventoryRevision, player: state.player, mission: state.mission, buildings: state.world.buildings, events: state.events.slice(-16), subscriberFailures: state.failures, renderer: scene.status().native, connection: state.connection ?? null }, null, 2);
  document.querySelector('#backend').textContent = scene.status().presentation.label + ' · WebGL 2' + (state.connection ? ' · server rev ' + state.connection.revision : '');
}
async function action(run) { try { const result = await run(); message(result); inspect(); return result; } catch (error) { message(error.message); } }
listen(document.querySelector('#place'), 'click', () => action(() => session.place(Number(document.querySelector('#x').value), Number(document.querySelector('#z').value))));
listen(document.querySelector('#invalid'), 'click', () => action(() => session.place(20, 20)));
listen(document.querySelector('#type'), 'change', event => action(() => session.select(event.target.value)));
listen(document.querySelector('#grant'), 'click', () => action(() => session.grant()));
listen(document.querySelector('#remove'), 'click', () => action(() => session.remove(document.querySelector('#building').value)));
listen(document.querySelector('#second'), 'click', () => action(() => session.place(6, 6, 'shelter', 'bob')));
listen(document.querySelector('#save'), 'click', () => action(() => session.save()));
listen(document.querySelector('#restore'), 'click', () => action(() => session.restore()));
listen(document.querySelector('#replay'), 'click', () => action(async () => { window.demoResult = await session.replay(); return window.demoResult; }));
listen(document.querySelector('#capture'), 'click', async () => { try { const frame = await scene.capture(); message({ capture: frame.metadata, litPixels: frame.pixels().some((v, i) => i % 4 !== 3 && v > 30) }); frame.bitmap?.close(); } catch (error) { message(error.message); } });
listen(canvas, 'pointerdown', event => { canvas.focus(); const point = scene.point(event); if (point) action(() => session.place(point.x, point.z)); });
listen(window, 'keydown', event => { if (session.client?.identity?.role==='viewer' || document.activeElement !== canvas || !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return; event.preventDefault(); keys.add(event.code); });
listen(canvas,'blur',()=>keys.clear());listen(document,'visibilitychange',()=>{if(document.hidden)keys.clear();});
listen(window, 'keyup', event => keys.delete(event.code)); listen(window, 'blur', () => keys.clear());
listen(document.querySelector('#restart'), 'click', async () => {
  if (restarting) return; restarting = true;
  try { cancelAnimationFrame(frame); await scene.dispose(); scene = await createGameplayScene(canvas, session); window.sourceWorld.scene = scene; inspect(); message('Scene restarted; world retained'); }
  finally { restarting = false; if (!disposed) frame = requestAnimationFrame(draw); }
});
const sampler=new MovementSampler({send:async(dx,dz)=>{const result=await session.move(dx,dz);inspect();if(!result.ok)throw Error(result.reason);return result;},intervalMs:serverMode?null:100,population:()=>serverMode?Math.max(1,session.inspect().players.length):1});
function draw(now) {
  if (disposed || restarting) return;
  if (lastMove) { frames.push(now - lastMove); if (frames.length > 180) frames.shift(); }
  lastMove = now;
  session.setInputActive?.(keys.size>0);
  if(keys.size){const dx=+(keys.has('KeyD')||keys.has('ArrowRight'))-+(keys.has('KeyA')||keys.has('ArrowLeft')),dz=+(keys.has('KeyS')||keys.has('ArrowDown'))-+(keys.has('KeyW')||keys.has('ArrowUp'));sampler.sample(dx,dz);}

  scene.draw();for(const r of sampler.samples)if(r.ok&&r.accepted!==false&&!r.visibleAt)r.visibleAt=now; if (serverMode && now - (draw.inspectedAt ?? 0) > 1000) { inspect(); draw.inspectedAt = now; } frame = requestAnimationFrame(draw);
}
window.constructionLab = session; window.demoResult = await session.replay();
window.sourceWorld = { session, scene, movement:sampler, diagnostics: () => ({ listeners: listeners.length, rafLoops: disposed ? 0 : 1, frames: [...frames], renderer: scene.status() }), async dispose() { disposed = true; cancelAnimationFrame(frame); keys.clear(); listeners.splice(0).forEach(off => off()); await scene.dispose(); await session.dispose(); } };
inspect(); frame = requestAnimationFrame(draw);
