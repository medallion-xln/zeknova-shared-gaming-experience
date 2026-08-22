const zkMissionObjectives={
grid:[{kind:"stat",key:"resourcesCollected",target:1,label:"Collect a field resource"},{kind:"stat",key:"treesChopped",target:1,label:"Chop a small tree"},{kind:"building",key:"power",target:1,label:"Install 1 Solar Grid"}],
water:[{kind:"stat",key:"resourcesCollected",target:2,label:"Collect 2 field resources"},{kind:"stat",key:"treesChopped",target:2,label:"Harvest 2 trees"},{kind:"building",key:"water",target:1,label:"Install 1 Water Works"}],
habitat:[{kind:"stat",key:"treesChopped",target:3,label:"Harvest 3 trees"},{kind:"stat",key:"resourcesCollected",target:3,label:"Collect 3 field resources"},{kind:"building",key:"habitat",target:1,label:"Install 1 Habitat"}],
"tower-one":[{kind:"stat",key:"enemiesDefeated",target:1,label:"Defeat 1 enemy"},{kind:"stat",key:"rocksMined",target:1,label:"Mine 1 stone"},{kind:"building",key:"defense",target:1,label:"Install 1 Defense Beacon"}],
"tower-ring":[{kind:"stat",key:"enemiesDefeated",target:3,label:"Defeat 3 enemies"},{kind:"stat",key:"rocksMined",target:2,label:"Mine 2 stones"},{kind:"building",key:"defense",target:2,label:"Install 2 Defense Beacons"}],
"supply-route":[{kind:"stat",key:"treesChopped",target:5,label:"Harvest 5 trees"},{kind:"stat",key:"rocksMined",target:3,label:"Mine 3 stones"},{kind:"either",keys:["bridge","boat"],target:1,label:"Install a Bridge or Survey Skiff"}],
research:[{kind:"stat",key:"powerUpsCollected",target:2,label:"Secure 2 power-ups"},{kind:"stat",key:"rocksMined",target:4,label:"Mine 4 rock formations"},{kind:"building",key:"research",target:1,label:"Install 1 AI Research Lab"}],
culture:[{kind:"stat",key:"treesChopped",target:7,label:"Harvest 7 trees"},{kind:"stat",key:"powerUpsCollected",target:3,label:"Secure 3 power-ups"},{kind:"building",key:"culture",target:1,label:"Install 1 Creator Commons"}],
governance:[{kind:"stat",key:"enemiesDefeated",target:5,label:"Defeat 5 enemies"},{kind:"stat",key:"resourcesCollected",target:5,label:"Collect 5 field resources"},{kind:"building",key:"governance",target:1,label:"Install 1 Civic Hall"}],
population:[{kind:"stat",key:"treesChopped",target:10,label:"Harvest 10 trees"},{kind:"either",keys:["zek_clinic","zek_watershed","zek_beacon","zek_grove","zek_habitat","zek_archive","zek_market","zek_watch","zek_transit"],target:1,label:"Complete 1 ZekNovan infrastructure build"},{kind:"building",key:"habitat",target:2,label:"Install 2 Habitats"}],
"advanced-research":[{kind:"stat",key:"rocksMined",target:8,label:"Mine 8 rock formations"},{kind:"stat",key:"powerUpsCollected",target:5,label:"Secure 5 power-ups"},{kind:"building",key:"research",target:2,label:"Install 2 AI Research Labs"}],
stronghold:[{kind:"stat",key:"rocksMined",target:12,label:"Mine 12 rock formations"},{kind:"stat",key:"enemiesDefeated",target:10,label:"Defeat 10 enemies"},{kind:"building",key:"defense",target:3,label:"Install 3 Defense Beacons"}]
};
zkCampaignTiers.splice(0,zkCampaignTiers.length,...createCampaignTiers());Object.assign(zkMissionObjectives,MISSION_OBJECTIVES);
for(const e of zkCampaignTiers)for(const t of e.missions)t.subObjectives=zkMissionObjectives[t.id]??[];
function zkObjectiveValue(e,t={}){return missionObjectiveValue(e,t)}
function zkObjectiveComplete(e,t){return zkObjectiveValue(e,t)>=e.target}
function zkMissionComplete(e,t){return(e.subObjectives??[]).every(s=>zkObjectiveComplete(s,t))}
const zkMissionSequence=zkCampaignTiers.flatMap(e=>e.missions.map(t=>({...t,tier:e.number,tierTitle:e.title}))),zkMissionGraph=new Map(zkMissionSequence.map((e,t)=>[e.id,{mission:e,prerequisite:t?zkMissionSequence[t-1].id:null,unlocks:zkMissionSequence[t+1]?.id??null}]));function zkCampaignState(e={}){const t=zkMissionSequence,s=t.findIndex(i=>!zkMissionComplete(i,e)),i=s===-1?null:t[s],n=zkCampaignTiers.find(r=>r.number===(i?.tier??zkCampaignTiers.at(-1)?.number))??zkCampaignTiers[0];return{current:i,currentIndex:s,completed:s===-1?t.length:s,total:t.length,tier:n,graph:i?zkMissionGraph.get(i.id):null}}
function zkMissionProgress(e,t){const s=e.subObjectives??[],i=s.filter(n=>zkObjectiveComplete(n,t)).length;return`${i}/${s.length} objectives complete`}
class wR{root;handlers;selectedClass="ensign";selectedBiome="highlands";selectedBuild=null;lastState=null;constructor(e,t){this.root=e,this.handlers=t}showLanding(e){this.root.innerHTML=`
      <main class="landing-shell">
        <div class="landing-backdrop"></div>
        <section class="landing-copy glass-panel">
          <div class="eyebrow">AI × CRYPTO EXPO 2026 · MISSION 2</div>
          <h1>ZEKNOVA</h1>
          <h2>Prepare the Planet</h2>
          <p>
            Humanity arrives in ten days. Form a hackathon team, choose a deployment biome,
            and rise from Ensign to Captain while building the most functional civilization on ZekNova.
          </p>
          <div class="mission-strip">
            <span>EXPLORE</span><i></i><span>BUILD</span><i></i><span>NEGOTIATE</span><i></i><span>COMPETE</span>
          </div>
        </section>

        <section class="login-panel glass-panel">
          <div class="panel-kicker">CREW REGISTRATION</div>
          <h3>${e?`Welcome back, ${Li(e.displayName)}`:"Enter the forward base"}</h3>
          <form id="crew-form">
            <label>Callsign<input name="displayName" required value="${Ma(e?.displayName??"")}" placeholder="Commander Nova" /></label>
            <label>Email<input name="email" type="email" required value="${Ma(e?.email??"")}" placeholder="you@company.com" /></label>
            <div class="form-row">
              <label>Team name<input name="teamName" required value="${Ma(e?.teamName??"")}" placeholder="Terraformers" /></label>
              <label>Team code<input name="teamCode" value="${Ma(e?.teamCode??"")}" placeholder="Optional" /></label>
            </div>
            <fieldset>
              <legend>Choose your deployment biome</legend>
              <div class="class-grid biome-grid">
                ${Object.entries(zkSignupBiomes).map(([s,i])=>`
                  <button class="class-card biome-card ${s===(e?.biome??"highlands")?"selected":""}" type="button" data-biome="${s}" style="--class-accent:${i.accent}">
                    <div class="class-rank">${i.icon} ${i.label}</div>
                    <div class="machine-name">${i.resources}</div>
                    <p>${i.hazard}</p>
                    <small>${i.value}</small>
                  </button>
                `).join("")}
              </div>
              <p class="rank-progression-note">All officers deploy as Ensigns. Complete Mission 4 plus four personal contribution goals for Lieutenant; complete Mission 8 plus eight goals for Captain.</p>
            </fieldset>
            <button class="primary-cta" type="submit">${e?"Resume mission":"Deploy to ZekNova"}</button>
            <p class="auth-note">The prototype uses local session fallback until the Medallion XLN auth adapter is connected.</p>
            <div id="login-error" class="form-error" role="alert"></div>
          </form>
        </section>
      </main>
    `,this.selectedClass="ensign",this.selectedBiome=e?.biome??"highlands",this.root.querySelectorAll("[data-biome]").forEach(s=>{s.addEventListener("click",()=>{this.selectedBiome=s.dataset.biome,this.root.querySelectorAll("[data-biome]").forEach(i=>i.classList.remove("selected")),s.classList.add("selected")})});const t=this.root.querySelector("#crew-form");t?.addEventListener("submit",async s=>{s.preventDefault();const i=t.querySelector('button[type="submit"]'),n=this.root.querySelector("#login-error");i?.setAttribute("disabled","true"),i&&(i.textContent="Preparing biome…"),n&&(n.textContent="");const r=new FormData(t);try{await this.handlers.onStart({displayName:String(r.get("displayName")??""),email:String(r.get("email")??""),teamName:String(r.get("teamName")??""),teamCode:String(r.get("teamCode")??""),biome:this.selectedBiome,officerClass:"ensign"})}catch(a){n&&(n.textContent=a instanceof Error?a.message:"Unable to start the mission."),i?.removeAttribute("disabled"),i&&(i.textContent="Deploy to ZekNova")}})}showGame(e){const t=vn[e.officerClass];this.root.innerHTML=`
      <div id="game-shell" class="game-shell" style="--class-accent:${t.accent}">
        <div id="viewport" class="viewport" aria-label="ZekNova 3D game viewport"></div>
        <div class="vignette"></div>
        <header class="top-hud glass-panel">
          <div class="brand-lockup"><span>AI × CRYPTO EXPO</span><strong>ZEKNOVA</strong></div>
          <div class="phase-block"><small id="phase-label">PHASE I</small><strong id="phase-title">Arrival & Reconnaissance</strong></div>
          <div class="score-ring"><span id="score-value">0</span><small>READINESS</small></div>
        </header>

        <aside class="left-hud">
          <section class="crew-card glass-panel">
            <div class="crew-avatar">${e.officerClass==="captain"?"C":e.officerClass==="lieutenant"?"L":"E"}</div>
            <div><small>${t.label.toUpperCase()}</small><strong>${Li(e.displayName)}</strong><span>${Li(e.teamName)} · ${Li(e.teamCode)}</span></div>
          </section>
          <section class="status-card glass-panel">
            <div class="meter-row"><span>Health</span><div><i id="health-bar"></i></div><b id="health-value">100</b></div>
            <div class="meter-row"><span>Stamina</span><div><i id="stamina-bar"></i></div><b id="stamina-value">100</b></div>
            <div class="meter-row"><span>Officer XP</span><div><i id="xp-bar"></i></div><b id="xp-value">0</b></div>
          </section>
          <section class="objective-card glass-panel">
            <small>CURRENT OBJECTIVE</small>
            <strong id="objective-title">Survey the biome</strong>
            <p id="objective-copy">Secure energy and freshwater before the first planetary hazard.</p>
            <div id="mission-progress" class="mission-progress">MISSION 1 / 12</div>
            <div id="diplomacy-status" class="diplomacy-status">FIRST CONTACT PENDING</div>
            <ol id="mission-ladder" class="mission-ladder"></ol>
            <ul id="sub-objective-list" class="sub-objective-list"></ul>
          </section>
          <section class="controls-card glass-panel">
            <small>CONTROLS</small>
            <p><kbd>WASD</kbd>/<kbd>Arrows</kbd> Move · <kbd>Shift</kbd> Sprint · <kbd>E</kbd> Harvest / Mine · <kbd>P</kbd> Pause</p>
            <p><kbd>Tab</kbd> Command · <kbd>Space</kbd> Fire · <kbd>Q</kbd> Special · <kbd>R</kbd> Reset${e.officerClass==="ensign"?" · <kbd>C</kbd> Reload · <kbd>V</kbd> Roll & Shoot":""}${e.officerClass==="captain"?" · <kbd>F</kbd> Mech Flight":""}</p>
            <p>Click terrain to auto-walk. Build a bridge or Survey Skiff to cross water before the Phase III hydro upgrade.</p>
            <div id="input-status" class="input-status">Click the world or press a movement key</div>
          </section>
        </aside>

        <aside class="right-hud">
          <section class="resources-card glass-panel">
            <div class="section-title"><span>COLONY SYSTEMS</span><button id="save-button" class="icon-button" title="Save mission">SAVE</button></div>
            <div id="resource-grid" class="resource-grid"></div>
          </section>
          <section class="readiness-card glass-panel">
            <div class="section-title"><span>READINESS MATRIX</span><small id="renderer-label">INITIALIZING</small></div>
            <div id="indicator-grid" class="indicator-grid"></div>
          </section>
          <section class="team-card glass-panel">
            <div class="section-title"><span>HACKATHON STANDINGS</span><small>CURRENT TEAM</small></div>
            <ol id="leaderboard" class="leaderboard"></ol>
            <div class="message-center-heading"><span>MESSAGE CENTER</span><strong id="message-credit-balance">0 CREDITS AVAILABLE</strong></div>
            <div id="toast-stack" class="toast-stack" aria-live="polite"></div>
          </section>
        </aside>

        <div class="movement-pad glass-panel" aria-label="Movement controls">
          <button type="button" data-move="forward" aria-label="Move forward">▲</button>
          <button type="button" data-move="left" aria-label="Move left">◀</button>
          <button type="button" data-move="backward" aria-label="Move backward">▼</button>
          <button type="button" data-move="right" aria-label="Move right">▶</button>
        </div>

        <div class="action-pad" aria-label="Explorer actions">
          <button type="button" data-action="collect"><kbd>E</kbd><span>HARVEST</span></button>
          <button type="button" data-action="fire"><kbd>SPACE</kbd><span>FIRE</span></button>
          <button type="button" data-action="special"><kbd>Q</kbd><span>SPECIAL</span></button>
          ${e.officerClass==="ensign"?'<button type="button" data-action="roll-fire"><kbd>V</kbd><span>ROLL & SHOOT</span></button>':""}
          <button type="button" data-action="pause"><kbd>P</kbd><span>PAUSE</span></button>
          ${e.officerClass==="captain"?'<button type="button" data-action="flight"><kbd>F</kbd><span>FLIGHT</span></button>':""}
        </div>

        <div class="mode-switcher glass-panel">
          <button id="mode-button" class="mode-button"><span id="mode-icon">◎</span><strong id="mode-label">ENTER COMMAND MODE</strong><small>Tab</small></button>
        </div>

        <section id="build-dock" class="build-dock glass-panel hidden">
          <div class="dock-heading"><span>CONSTRUCTION MATRIX</span><div class="build-audience-tabs" role="group" aria-label="Infrastructure recipient"><button type="button" class="active" data-build-filter="colony">COLONY</button><button type="button" data-build-filter="zeknovan">ZEKNOVAN AID</button></div><small>SELECT A SYSTEM, THEN CLICK BUILDABLE TERRAIN</small></div>
          <div class="build-options">
            ${eo.filter(s=>zkRankAllowsBuilding(e.officerClass,s.type)).map(s=>`
              <button class="build-button${s.audience==="zeknovan"?" zeknovan-build hidden":""}" data-build="${s.type}" data-build-audience="${s.audience??"colony"}" title="${Ma(s.description)}">
                <b>${s.icon}</b><span>${s.label}</span>${s.audience==="zeknovan"?`<em>−${Math.abs(s.tension)} TENSION</em>`:""}<small>${pm(s.cost)}</small>
              </button>
            `).join("")}
          </div>
        </section>

        <button id="advisor-toggle" class="advisor-orb" title="Talk to robot companion">BOT</button>
        <section id="advisor-panel" class="advisor-panel robot-console glass-panel hidden" role="dialog" aria-label="Robot companion console">
          <div class="robot-console-header">
            <div><small>COMPANION LINK</small><strong>SCOUT-01</strong></div>
            <span id="advisor-provider" class="robot-provider">LOCAL LINK</span>
            <button id="advisor-close" class="icon-button" aria-label="Close robot console">×</button>
          </div>
          <div id="advisor-messages" class="advisor-messages">
            <p class="advisor-response">SCOUT-01 online. Click me in the world whenever you want to talk. I can read our live colony telemetry, discuss the mission, or just keep you company in the field.</p>
          </div>
          <form id="advisor-form"><textarea id="advisor-input" rows="2" maxlength="2400" placeholder="Message SCOUT-01…"></textarea><button>SEND</button></form>
          <small class="robot-console-note">ENTER TO SEND · SHIFT+ENTER FOR A NEW LINE · API KEYS STAY SERVER-SIDE</small>
        </section>

        <div id="interaction-prompt" class="interaction-prompt hidden">Press <kbd>E</kbd> to collect</div>
        <div id="crosshair" class="crosshair">+</div>

        <div id="pause-overlay" class="pause-overlay hidden">
          <section class="pause-card glass-panel">
            <div class="panel-kicker">SIMULATION PAUSED</div>
            <h3>Field command interface</h3>
            <p>Movement, mining, hazards, projectiles, enemies, and production are frozen. Use the tabs above for missions, colony systems, Team Comms, messages, and controls.</p>
            <div class="pause-actions">
              <button id="pause-talk-button" type="button" class="pause-option"><span>BOT</span><strong>TALK TO YOUR MECH</strong><small>Open the companion console</small></button>
              <button id="pause-messages-button" type="button" class="pause-option"><span>LOG</span><strong>READ ALL MESSAGES</strong><small>Open the scrollable mission history</small></button>
            </div>
            <button id="resume-button" class="primary-cta">RESUME MISSION</button>
          </section>
          <section id="pause-message-panel" class="pause-message-panel glass-panel hidden" role="dialog" aria-label="Mission message history">
            <header>
              <div><small>MISSION ARCHIVE</small><strong>STATUS MESSAGE HISTORY</strong></div>
              <span id="pause-message-credit-balance">0 CREDITS AVAILABLE</span>
              <button id="pause-messages-close" type="button" class="icon-button" aria-label="Close message history">×</button>
            </header>
            <div id="pause-message-history" class="pause-message-history" tabindex="0">
              <p class="pause-message-empty">Status updates will appear here as the mission develops.</p>
            </div>
          </section>
        </div>

        <div id="diplomacy-modal" class="modal-layer hidden">
          <section class="diplomacy-modal glass-panel">
            <div class="panel-kicker">FIRST CONTACT PROTOCOL</div>
            <h3>ZekNovan boundary dispute</h3>
            <p>The local highland community objects to construction near a protected watershed. This choice permanently changes patrol behavior and ecosystem stewardship.</p>
            <div class="diplomacy-actions">
              <button data-diplomacy="share"><strong>Shared Water Project</strong><span>Grant ZekNovans watershed control. Patrols become rare while protected water steadily improves ecology and biomass.</span></button>
              <button data-diplomacy="negotiate"><strong>Negotiate a Safe Zone</strong><span>Establish a protected marine work zone. ZekNovans will not enter or attack personnel inside its boundary.</span></button>
              <button data-diplomacy="force" class="danger"><strong>Force Access — All-Out War</strong><span>Seize the watershed. Hostile forces will attack constantly in larger numbers.</span></button>
            </div>
          </section>
        </div>

        <button id="logout-button" class="logout-button">EXIT MISSION</button>
      </div>
    `,this.bindGameEvents(),document.getElementById("resume-button")?.addEventListener("click",this.handlers.onPause)}
updateHud(e){this.lastState=e;
const context=e.missionContext??{buildings:e.buildingCounts,stats:{}},campaign=zkCampaignState(context),mission=campaign.current,tier=campaign.tier;di("phase-label",`TIER ${SR(tier.number)}`),di("phase-title",tier.title),di("score-value",Math.round(e.score).toString()),di("health-value",Math.round(e.health).toString()),di("stamina-value",Math.round(e.stamina).toString()),di("xp-value",Math.round(e.xp).toString()),sh("health-bar",e.health),sh("stamina-bar",e.stamina),sh("xp-bar",e.xp%100),di("renderer-label",e.rendererLabel);
di("objective-title",mission?.title??"Frontier stronghold operational"),di("objective-copy",mission?`${mission.objective} ${zkMissionProgress(mission,context)}.`:"All installation tiers are complete. Continue defending, expanding, and improving readiness."),di("mission-progress",mission?`MISSION ${campaign.currentIndex+1} / ${campaign.total}`:`ALL ${campaign.total} MISSIONS COMPLETE`);
const diplomacyLabels={share:"WATERSHED STEWARDSHIP · LOW PATROL RISK",negotiate:"NEGOTIATED SAFE ZONE · PROTECTED",force:"ALL-OUT WAR · CONSTANT ATTACKS"};di("diplomacy-status",diplomacyLabels[e.diplomacyOutcome]??"FIRST CONTACT PENDING");const diplomacyStatus=document.getElementById("diplomacy-status");diplomacyStatus&&(diplomacyStatus.dataset.outcome=e.diplomacyOutcome??"pending");
const missionList=document.getElementById("mission-ladder");missionList&&(missionList.innerHTML=tier.missions.map(t=>{const s=zkMissionComplete(t,context),i=t.id===mission?.id,n=s?"complete":i?"active":"locked",r=s?"✓":i?"◆":"◇";return`<li class="${n}"><span>${r}</span><b>${Li(t.title)}</b></li>`}).join(""));
const objectiveList=document.getElementById("sub-objective-list");objectiveList&&(objectiveList.innerHTML=mission?(mission.subObjectives??[]).map(t=>{const s=zkObjectiveComplete(t,context),i=Math.min(zkObjectiveValue(t,context),t.target);return`<li class="${s?"complete":""}"><span>${s?"✓":"○"}</span><b>${Li(t.label)}</b><small>${i}/${t.target}</small></li>`}).join(""):"<li class=\"complete\"><span>✓</span><b>All mission objectives complete</b></li>");
const s=document.getElementById("resource-grid");if(s){const h=[["energy","Energy","⚡"],["water","Water","◉"],["minerals","Minerals","◆"],["iron","Iron Ore","⬢"],["biomass","Biomass","❋"],["timber","Timber","▥"],["data","Data","◈"],["credits","Colony Credits","◎"],["trust","Local Trust","◇"]];s.innerHTML=h.map(([d,p,f])=>`
        <div class="resource-item"><b>${f}</b><span>${p}</span><strong>${Math.round(e.resources[d])}</strong></div>
      `).join("")}const availableCredits=Math.max(0,Math.floor(Number(e.resources.credits)||0));di("message-credit-balance",`${availableCredits} CREDIT${availableCredits===1?"":"S"} AVAILABLE`);const i=document.getElementById("indicator-grid");i&&(i.innerHTML=Object.entries(e.indicators).map(([h,d])=>`
        <div class="indicator"><span>${MR(h)}</span><div><i style="width:${Math.max(0,Math.min(100,d))}%"></i></div><b>${Math.round(d)}</b></div>
      `).join(""));const n=document.getElementById("leaderboard");if(n){const h=[{name:e.user.teamName,score:e.score,mine:!0}];n.innerHTML=h.map((d,p)=>`
        <li class="${d.mine?"mine":""}"><span>${p+1}</span><strong>${Li(d.name)}</strong><b>${Math.round(d.score)}</b></li>
      `).join("")}const r=document.getElementById("mode-button"),a=document.getElementById("mode-label"),l=document.getElementById("mode-icon"),c=document.getElementById("build-dock"),u=document.getElementById("crosshair");e.mode==="command"?(r?.classList.add("active"),a&&(a.textContent="RETURN TO EXPLORATION"),l&&(l.textContent="⌖"),c?.classList.remove("hidden"),u?.classList.add("hidden")):(r?.classList.remove("active"),a&&(a.textContent="ENTER COMMAND MODE"),l&&(l.textContent="◎"),c?.classList.add("hidden"),u?.classList.remove("hidden")),this.root.querySelectorAll("[data-build]").forEach(h=>{const d=h.dataset.build;h.classList.toggle("selected",d===this.selectedBuild);const p=eo.find(x=>x.type===d),f=p?Object.fromEntries(Object.entries(p.cost).map(([x,b])=>[x,x==="minerals"&&e.user.officerClass==="lieutenant"?Math.ceil(Number(b)*.85):Number(b)])):{},m=Object.entries(f).map(([x,b])=>[x,Math.max(0,Number(b)-Number(e.resources[x]??0))]).filter(([,x])=>x>0),g=m.length===0;h.classList.toggle("unaffordable",!g);const y=h.querySelector("small");y&&(y.textContent=g?pm(f):`NEED ${m.map(([x,b])=>`${x.slice(0,1).toUpperCase()}+${Math.ceil(b)}`).join(" · ")}`)})}
setInteraction(e){const t=document.getElementById("interaction-prompt");t&&(e?(t.innerHTML=e,t.classList.remove("hidden")):t.classList.add("hidden"))}
showToast(e,t,s="info"){
  const i=document.getElementById("toast-stack");
  if(!i)return;
  const n=document.createElement("article"),r=Number(this.lastState?.resources?.credits),availableCredits=Math.max(0,Math.floor(r)),a=Number.isFinite(r)?`<small class="toast-credit-balance">◎ ${availableCredits} COLONY CREDIT${availableCredits===1?"":"S"} AVAILABLE</small>`:"";
  n.className=`toast ${s}`,n.innerHTML=`<strong>${Li(e)}</strong><p>${Li(t)}</p>${a}`,i.prepend(n);
  while(i.children.length>4)i.lastElementChild?.remove();
  const history=document.getElementById("pause-message-history");
  if(history){history.querySelector(".pause-message-empty")?.remove();const entry=document.createElement("article"),time=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});entry.className=`pause-history-entry ${s}`,entry.innerHTML=`<div><time>${Li(time)}</time><strong>${Li(e)}</strong></div><p>${Li(t)}</p>${a}`,history.prepend(entry);while(history.children.length>200)history.lastElementChild?.remove()}
  requestAnimationFrame(()=>n.classList.add("visible"))
}
showDiplomacy(){document.getElementById("diplomacy-modal")?.classList.remove("hidden")}
openRobotConsole(){const e=document.getElementById("advisor-panel"),t=document.getElementById("advisor-input");e?.classList.remove("hidden"),window.setTimeout(()=>t?.focus(),0)}
setBuildSelection(e){this.selectedBuild=e,this.handlers.onSelectBuild(e),this.root.querySelectorAll("[data-build]").forEach(t=>{t.classList.toggle("selected",t.dataset.build===e)})}
bindGameEvents(){document.getElementById("mode-button")?.addEventListener("click",this.handlers.onToggleMode),document.getElementById("save-button")?.addEventListener("click",async()=>{await this.handlers.onSave(),this.showToast("Mission saved","Team biome data was written to persistent storage.","success")}),document.getElementById("logout-button")?.addEventListener("click",this.handlers.onLogout),document.querySelector('[data-action="pause"]')?.addEventListener("click",this.handlers.onPause),this.root.querySelectorAll("[data-build]").forEach(t=>{t.addEventListener("click",()=>{const s=t.dataset.build;this.setBuildSelection(this.selectedBuild===s?null:s)})});const e=document.getElementById("advisor-panel"),t=document.getElementById("advisor-input"),pauseHistory=document.getElementById("pause-message-panel");document.getElementById("advisor-toggle")?.addEventListener("click",()=>this.openRobotConsole()),document.getElementById("advisor-close")?.addEventListener("click",()=>e?.classList.add("hidden")),document.getElementById("pause-talk-button")?.addEventListener("click",()=>{pauseHistory?.classList.add("hidden"),this.openRobotConsole()}),document.getElementById("pause-messages-button")?.addEventListener("click",()=>{e?.classList.add("hidden"),pauseHistory?.classList.remove("hidden"),document.getElementById("pause-message-history")?.focus()}),document.getElementById("pause-messages-close")?.addEventListener("click",()=>pauseHistory?.classList.add("hidden")),t?.addEventListener("keydown",s=>{s.key==="Enter"&&!s.shiftKey&&(s.preventDefault(),document.getElementById("advisor-form")?.requestSubmit())}),document.getElementById("advisor-form")?.addEventListener("submit",async s=>{s.preventDefault();const i=document.getElementById("advisor-input"),n=document.getElementById("advisor-messages"),r=i?.value.trim()??"";if(!r||!n)return;const a=document.createElement("p");a.className="advisor-question",a.textContent=r,n.append(a),i&&(i.value="",i.disabled=!0);const l=document.createElement("p");l.className="advisor-response thinking",l.textContent="SCOUT-01 is processing mission telemetry…",n.append(l),n.scrollTop=n.scrollHeight;const c=await this.handlers.onAdvisor(r),u=typeof c==="string"?{answer:c,provider:"offline",model:null}:c;l.textContent=u.answer,l.classList.remove("thinking"),i&&(i.disabled=!1,i.focus());const h=document.getElementById("advisor-provider");h&&(h.textContent=u.provider==="offline"?"LOCAL LINK":`${String(u.provider).toUpperCase()} · ${u.model??"UPLINK"}`,h.dataset.provider=u.provider),n.scrollTop=n.scrollHeight});
this.root.querySelectorAll("[data-diplomacy]").forEach(t=>{t.addEventListener("click",()=>{const s=this.handlers.onDiplomacy(t.dataset.diplomacy),i=typeof s==="string"&&s.startsWith("The colony lacks");i||document.getElementById("diplomacy-modal")?.classList.add("hidden"),this.showToast(i?"Agreement unavailable":"Diplomacy outcome",s,i?"warning":t.dataset.diplomacy==="force"?"danger":"success")})})
}}function pm(o){return Object.entries(o).map(([e,t])=>`${e.slice(0,1).toUpperCase()}${t}`).join(" · ")}function di(o,e){const t=document.getElementById(o);t&&(t.textContent=e)}function sh(o,e){const t=document.getElementById(o);t instanceof HTMLElement&&(t.style.width=`${Math.max(0,Math.min(100,e))}%`)}function SR(o){return["I","II","III","IV"][Math.max(0,Math.min(3,o-1))]??"I"}function MR(o){return String(o??"").replace(/([A-Z])/g," $1").replace(/^./,e=>e.toUpperCase())}function Li(o){return String(o??"").replace(/[&<>'"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[e]??e)}function Ma(o){return Li(o)}
const dr="zeknova.user.v1",zkLocalDemoEnabled=location.protocol==="file:"||(["localhost","127.0.0.1","::1"].includes(location.hostname)&&new URLSearchParams(location.search).get("demo")==="1");
let zkAuthContext={mode:zkLocalDemoEnabled?"demo":"medallion",available:true,authenticated:false,signedOut:false,enrolled:false,identity:null,enrollment:null,loginUrl:"/"};
globalThis.ZekNovaAuth={get context(){return zkAuthContext},localDemo:zkLocalDemoEnabled};
class vR{
async restore(){if(zkLocalDemoEnabled){const e=localStorage.getItem(dr);if(!e)return null;try{const t=JSON.parse(e);zkAuthContext={...zkAuthContext,authenticated:true,enrolled:true,identity:{displayName:t.displayName??"",email:t.email??""},enrollment:t};return t}catch{return localStorage.removeItem(dr),null}}try{const e=await fetch(`${Be.apiBase}/session.php`,{credentials:"include",headers:{Accept:"application/json"}}),t=await e.json().catch(()=>({}));if(!e.ok)throw new Error(t.error||"Authentication service unavailable.");zkAuthContext={...zkAuthContext,...(t.auth??{}),available:true};if(t.user)return localStorage.setItem(dr,JSON.stringify(t.user)),t.user;return localStorage.removeItem(dr),null}catch(e){return localStorage.removeItem(dr),zkAuthContext={...zkAuthContext,available:false,authenticated:false,enrolled:false,error:e instanceof Error?e.message:"Authentication service unavailable."},null}}
async login(e){if(!e.displayName.trim())throw new Error("Enter a callsign.");if(!e.teamName.trim())throw new Error("Enter a team name.");if(zkLocalDemoEnabled){if(!e.email.trim())throw new Error("Enter an email address for local testing.");const t={id:`demo-${AR(e.email.toLowerCase())}`,displayName:e.displayName.trim(),email:e.email.trim().toLowerCase(),teamName:e.teamName.trim(),teamCode:e.teamCode.trim().toUpperCase()||NR(e.teamName),officerClass:"ensign",biome:e.biome||"highlands",rankXp:0};return localStorage.setItem(dr,JSON.stringify(t)),zkAuthContext={...zkAuthContext,authenticated:true,enrolled:true,identity:{displayName:t.displayName,email:t.email},enrollment:t},t}const t=await fetch(`${Be.apiBase}/session.php`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(e)}),s=await t.json().catch(()=>({}));if(!t.ok)throw new Error(s.error||"Unable to enroll this Medallion XLN account.");if(!s.user)throw new Error("The authentication service returned an invalid session.");return localStorage.setItem(dr,JSON.stringify(s.user)),zkAuthContext={...zkAuthContext,available:true,authenticated:true,signedOut:false,enrolled:true,identity:{displayName:s.user.displayName,email:s.user.email},enrollment:s.user},s.user}
async logout(){localStorage.removeItem(dr);if(zkLocalDemoEnabled){zkAuthContext={...zkAuthContext,authenticated:false,enrolled:false,identity:null,enrollment:null};return}try{await fetch(`${Be.apiBase}/session.php`,{method:"DELETE",credentials:"include"}),zkAuthContext={...zkAuthContext,signedOut:true}}catch{zkAuthContext={...zkAuthContext,available:false}}}}
function AR(o){let e=2166136261;for(let t=0;t<o.length;t+=1)e^=o.charCodeAt(t),e=Math.imul(e,16777619);return e>>>0}function NR(o){return`${o.replace(/[^a-z0-9]/gi,"").slice(0,4).toUpperCase()||"TEAM"}-${Math.floor(1e3+Math.random()*9e3)}`}class RR{key(e){return`zeknova.save.v1.${e}`}async load(e){try{const s=await fetch(`${Be.apiBase}/save.php?team=${encodeURIComponent(e)}`,{credentials:"include",headers:{Accept:"application/json"}});if(s.ok){const i=await s.json();if(i.save)return localStorage.setItem(this.key(e),JSON.stringify(i.save)),i.save}}catch{}const t=localStorage.getItem(this.key(e));if(!t)return null;try{return JSON.parse(t)}catch{return localStorage.removeItem(this.key(e)),null}}
async save(e){localStorage.setItem(this.key(e.user.teamCode),JSON.stringify(e));try{await fetch(`${Be.apiBase}/save.php`,{method:"POST",credentials:"include",keepalive:!0,headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(e)})}catch{}}}
class ER{history=[];async advise(e,t){const s=this.history.slice(-12);try{const i=await fetch(`${Be.apiBase}/ai-advisor.php`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({question:e,context:t,history:s})});if(i.ok){const n=await i.json();if(n.answer){const r={answer:String(n.answer),provider:String(n.provider??"configured"),model:n.model?String(n.model):null};return this.history.push({role:"user",content:e},{role:"assistant",content:r.answer}),this.history=this.history.slice(-16),r}}}catch{}const i=CR(e,t);return this.history.push({role:"user",content:e},{role:"assistant",content:i}),this.history=this.history.slice(-16),{answer:i,provider:"offline",model:null}}}
function CR(o,e){const t=[["energy stability",e.resources.energy,"build a Solar Grid"],["water security",e.resources.water,"build Water Works near the river"],["ecology",e.indicators.ecology,"protect vegetation and add a Creator Commons"],["governance",e.indicators.governance,"establish a Civic Hall"],["defense",e.indicators.defense,"place a Defense Beacon on high ground"],["local trust",e.resources.trust,"choose diplomacy and avoid protected territory"]];t.sort((a,l)=>a[1]-l[1]);const[s,i,n]=t[0]??["infrastructure",0,"expand the settlement"],r=o.toLowerCase();return r.includes("score")||r.includes("win")?`Your fastest scoring opportunity is ${s} (${Math.round(i)}). ${fm(n)} first, then connect it to housing or research so the upgrade improves more than one readiness category.`:r.includes("locals")||r.includes("diplom")?`Local trust is ${Math.round(e.resources.trust)}. Keep construction outside the marked cultural reserve, fund a shared water project, and select dialogue before force. Trust above 65 unlocks a major resilience bonus.`:r.includes("build")||r.includes("next")?`Recommended next action: ${n}. Your Phase ${e.phase} colony score is ${Math.round(e.score)}. Build for balance—uncoupled structures produce less value than power, water, habitat, and research working together.`:`I reviewed the colony. The weakest system is ${s} at ${Math.round(i)}. ${fm(n)}. Preserve at least 20 minerals for emergency repairs and keep local trust above 40 to reduce hostile encounters.`}
function fm(o){return o.charAt(0).toUpperCase()+o.slice(1)}
