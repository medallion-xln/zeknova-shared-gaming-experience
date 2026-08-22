  }catch(e){}
  // Keep claimed rewards separate (QA should not grant production rewards)
  // this.missionStats.claimedBossRewards stays as permanent only
  this.missionStats.activeBoss=null;this.aoResourceCollected={...this.aoResourceCollected, ...Object.fromEntries(Object.entries(this.qaGameplayProgress.biomes).map(([id,b])=>[id, Math.max(Number(this.aoResourceCollected?.[id]??0), Number(b.resources??0))]))},Object.assign(this.simulation.resources,{energy:500,water:500,minerals:750,iron:400,biomass:500,timber:750,data:300,credits:500,trust:60}),this.diplomacyOutcome=this.diplomacyOutcome||"negotiate",this.diplomacyTension=this.diplomacyTension??35,this.personalObjectiveIds=new Set(Array.from({length:state.rank==="captain"?8:state.rank==="lieutenant"?4:0},(_,index)=>`qa-goal-${index+1}`)),zkGameplayStateForceRank(this,state.rank),zkGameplayStateSpawn(this,state),this.bossManager?.active&&this.bossManager.cleanup(!1),window.clearInterval(this.progressionTimer),this.enemySpawnDelay=Math.max(Number(this.enemySpawnDelay??8),12),this.updateHud(!0),zkGameplayStateQaOutput(this),this.qaGameplayStateTimer=window.setInterval(()=>zkGameplayStateQaOutput(this),250);const launchDelay=1250;if(state.kind==="boss")window.setTimeout(()=>{if(this.disposed)return;this.bossManager?.active&&this.bossManager.cleanup(!1),zkGameplayStateSpawn(this,state);const started=this.bossManager?.startEncounter({missionId:state.missionId,force:!0});started&&(this.player.health=100,this.updateHud(!0),this.ui.showToast(`QA BOSS ${state.number}/12`,`${state.bossName} encounter staged in the ${state.biome.toUpperCase()} AO. This session will not alter the shared save.`,"warning")),zkGameplayStateQaOutput(this)},launchDelay);else window.setTimeout(()=>{if(this.disposed)return;this.bossManager?.active&&this.bossManager.cleanup(!1),this.ui.showToast(`QA MISSION ${state.number}/12`,`${state.missionTitle} staged in the ${state.biome.toUpperCase()} AO. Prior missions are complete for this isolated session.`,"success"),this.updateHud(!0),zkGameplayStateQaOutput(this)},launchDelay);globalThis.ZekNovaGameplayState={state,states:GAMEPLAY_STATES,snapshot:()=>zkGameplayStateQaSnapshot(this)};return result};
const zkGameplayStateDispose=zR.prototype.dispose;
zR.prototype.dispose=function(){window.clearInterval(this.qaGameplayStateTimer),document.getElementById("qa-gameplay-state-badge")?.remove();return zkGameplayStateDispose.call(this)};

/* --- Command-mode building relocation ------------------------------------
   In command (isometric) mode a placed structure can be picked up and dragged.
   While it is held, its utility requirements are recomputed every frame against
   the live network - excluding itself, so a Solar Grid never reports that it is
   powering itself - and the readout names the source it would draw from and how
   far away it is. Translucent range walls show the reach of the nearest power
   and water source so the player can see the edge instead of guessing at it.
   The move only commits if the ground can actually hold the structure; anything
   else snaps it back to where it was picked up. */
const ZK_RELOCATE_UTILITY_LABEL = { power: "Power", water: "Water", data: "Data" };

function zkRelocateReadoutNode() {
  let node = document.getElementById("zeknova-relocate-readout");
  if (node) return node;
  node = document.createElement("aside");
  node.id = "zeknova-relocate-readout";
  node.setAttribute("aria-live", "polite");
  node.dataset.visible = "false";
  document.body.appendChild(node);
  return node;
}

function zkRelocateRings(game) {
  if (game.zkRelocateRings) return game.zkRelocateRings;
  const group = new Ge();
  group.name = "relocateRangeRings";
  group.visible = !1;
  for (const utility of ["power", "water"]) {
    const range = zkUtilityNetwork.range[utility];
    // An open-ended cylinder reads as a wall of reach rather than a flat decal,
    // which stays legible on sloped ground.
    const mesh = new R(new ve(range, range, 2.4, 72, 1, !0), new ie({
      color: zkUtilityNetwork.colors[utility],
      emissive: zkUtilityNetwork.colors[utility],
      emissiveIntensity: .55,
      transparent: !0,
      opacity: .16,
      depthWrite: !1,
      side: 2,
    }));
    mesh.userData.utility = utility;
    mesh.visible = !1;
    group.add(mesh);
  }
  game.scene.add(group);
  game.zkRelocateRings = group;
  return group;
}

/** The live picture of what the structure would connect to at (x, z). */
function zkRelocateSurvey(game, record, x, z) {
  const manager = game.buildings;
  const required = zkUtilityNetwork.requirements[record.type] ?? [];
  const links = required.map((utility) => {
    const range = zkUtilityNetwork.range[utility] ?? 0;
    // Exclude this record so a structure is never treated as its own supply.
    const source = zkFindUtilitySource(manager, utility, x, z, record.id);
    const distance = source ? Math.hypot(Number(source.x) - x, Number(source.z) - z) : null;
    const state = !source ? "lost" : distance > range * .85 ? "stretched" : "linked";
    return { utility, source, distance, range, state };
  });
  // isValidSite() folds the utility connection into its answer, but a relocation is
  // allowed to end up offline - the readout above is what tells the player that.
  // So separate the two: the site is "clear" when the ground itself can hold the
  // structure, regardless of whether anything reaches it. isValidSite records the
  // connection complaint in lastConnectionRequirement and only computes it after
  // the physical test has already passed, which is what makes them separable.
  // The record is lifted out of the list first so it never collides with itself.
  const index = manager.records.indexOf(record);
  if (index >= 0) manager.records.splice(index, 1);
  let valid;
  try {
    valid = manager.isValidSite(record.type, x, z, game.terrain);
    if (!valid && record.type !== "water") valid = !!manager.lastConnectionRequirement;
  } finally {
    if (index >= 0) manager.records.splice(index, 0, record);
  }
  return { links, valid, connected: links.every((link) => !!link.source) };
}

function zkRelocateRender(game, record, survey, x, z) {
  const node = zkRelocateReadoutNode();
  const rows = survey.links.map((link) => {
    const label = ZK_RELOCATE_UTILITY_LABEL[link.utility] ?? link.utility;
    const value = link.source
      ? `${link.distance.toFixed(1)}m / ${link.range}m`
      : `NO SOURCE &lt;${link.range}m`;
    return `<div class="zk-relocate-row" data-state="${link.state}"><span>${label}</span><b>${value}</b></div>`;
  }).join("");
  const name = zkUtilityNetwork.labels[record.type] ?? eo.find((item) => item.type === record.type)?.label ?? record.type;
  node.dataset.site = survey.valid ? "clear" : "blocked";
  node.dataset.visible = "true";
  node.innerHTML = `<h4>Relocating</h4><p class="zk-relocate-name">${name}</p>${rows || '<div class="zk-relocate-row" data-state="linked"><span>Utilities</span><b>NONE REQUIRED</b></div>'}<p class="zk-relocate-site">${survey.valid ? "Ground clear" : "Ground blocked — will snap back"}</p><p class="zk-relocate-hint">Release to place · Esc to cancel</p>`;

  const rings = zkRelocateRings(game);
  rings.visible = !0;
  for (const mesh of rings.children) {
    const link = survey.links.find((item) => item.utility === mesh.userData.utility);
    mesh.visible = !!link?.source;
    if (!link?.source) continue;
    // Centre each wall on the source, not the structure, so the player can see
    // exactly how much slack is left before the link drops.
    mesh.position.set(Number(link.source.x), game.terrain.heightAt(Number(link.source.x), Number(link.source.z)) + 1.2, Number(link.source.z));
    mesh.material.opacity = link.state === "stretched" ? .3 : .16;
  }
}

function zkRelocateHide(game) {
  const node = document.getElementById("zeknova-relocate-readout");
  if (node) node.dataset.visible = "false";
  if (game.zkRelocateRings) game.zkRelocateRings.visible = !1;
}

function zkRelocateMeshFor(game, id) {
  return game.buildings.group.children.find((child) => child.userData.buildingId === id) ?? null;
}

function zkRelocatePick(game, event) {
  const canvas = game.renderer?.domElement;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  game.pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
  game.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  game.raycaster.setFromCamera(game.pointer, game.camera);
  // The build preview and the utility link tubes are children of the same group,
  // so the nearest hit is often not a structure. Walk the hits in depth order and
  // take the first one that actually resolves to a record.
  for (const hit of game.raycaster.intersectObject(game.buildings.group, !0)) {
    let node = hit.object;
    while (node && node.userData.buildingId === void 0 && node !== game.buildings.group) node = node.parent;
    const id = node?.userData.buildingId;
    if (id === void 0) continue;
    const record = game.buildings.records.find((item) => item.id === id);
    if (record) return record;
  }
  return null;
}

function zkRelocateGround(game, event) {
  const canvas = game.renderer?.domElement;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  game.pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
  game.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  game.raycaster.setFromCamera(game.pointer, game.camera);
  return game.raycaster.intersectObject(game.terrain.mesh, !1)[0]?.point ?? null;
}

function zkRelocateMove(game, record, x, z) {
  const mesh = zkRelocateMeshFor(game, record.id);
  const y = game.buildings.siteHeight(record.type, x, z, game.terrain);
  record.x = x; record.z = z; record.y = y;
  if (mesh) mesh.position.set(x, y, z);
  // The spatial hash only reindexes when the record count changes, so a move has
  // to invalidate it explicitly or every lookup keeps using the old position.
  game.buildings.zkUtilityIndexedCount = -1;
  game.buildings.refreshUtilityRecords();
}

function zkRelocateFinish(game, commit) {
  const drag = game.zkRelocateDrag;
  if (!drag) return;
  game.zkRelocateDrag = null;
  const target = commit && drag.valid ? { x: drag.x, z: drag.z } : { x: drag.originX, z: drag.originZ };
  zkRelocateMove(game, drag.record, target.x, target.z);
  zkRelocateHide(game);
  if (game.controls) game.controls.enabled = drag.controlsWereEnabled;
  const label = zkUtilityNetwork.labels[drag.record.type] ?? drag.record.type;
  if (!commit) game.ui.showToast("Move cancelled", `${label} returned to its original site.`, "info");
  else if (!drag.valid) game.ui.showToast("Site blocked", `${label} could not stand there and snapped back.`, "warning");
  else {
    const survey = zkRelocateSurvey(game, drag.record, target.x, target.z);
    if (survey.connected) game.ui.showToast("Structure relocated", `${label} moved and stayed on the network.`, "success");
    else game.ui.showToast("Structure relocated — offline", `${label} moved out of range of ${survey.links.filter((link) => !link.source).map((link) => zkUtilityNetwork.labels[link.utility]).join(" and ")}.`, "warning");
    game.updateHud?.(!0);
  }
}

const zkRelocateInitialize = zR.prototype.initialize;
zR.prototype.initialize = async function () {
  const result = await zkRelocateInitialize.call(this);
  const canvas = this.renderer?.domElement;
  if (!canvas) return result;

  const basePointerDown = this.onPointerDown, basePointerMove = this.onPointerMove;
  canvas.removeEventListener("pointerdown", basePointerDown);
  this.onPointerDown = (event) => {
    // Only in command mode, only with an empty build cursor - otherwise the click
    // still means "place the selected structure here".
    if (event.button === 0 && this.mode === "command" && !this.buildings?.selectedType && !this.bossManager?.active) {
      const record = zkRelocatePick(this, event);
      if (record && Number(record.health ?? 1000) > 0) {
        this.zkRelocateDrag = {
          record,
          originX: Number(record.x),
          originZ: Number(record.z),
          x: Number(record.x),
          z: Number(record.z),
          valid: !0,
          controlsWereEnabled: !!this.controls?.enabled,
        };
        if (this.controls) this.controls.enabled = !1;
        canvas.setPointerCapture?.(event.pointerId);
        zkRelocateRender(this, record, zkRelocateSurvey(this, record, Number(record.x), Number(record.z)), Number(record.x), Number(record.z));
        event.preventDefault();
        return;
      }
    }
    return basePointerDown(event);
  };
  canvas.addEventListener("pointerdown", this.onPointerDown);

  canvas.removeEventListener("pointermove", basePointerMove);
  this.onPointerMove = (event) => {
    const drag = this.zkRelocateDrag;
    if (!drag) return basePointerMove(event);
    const point = zkRelocateGround(this, event);
    if (!point) return;
    const x = Kt.clamp(point.x, -82, 82), z = Kt.clamp(point.z, -82, 82);
    const survey = zkRelocateSurvey(this, drag.record, x, z);
    drag.x = x; drag.z = z; drag.valid = survey.valid;
    const now = performance.now();
    if (now - (drag.lastRebuildAt ?? 0) > 40) { drag.lastRebuildAt = now; zkRelocateMove(this, drag.record, x, z); }
    else { drag.record.x = x; drag.record.z = z; const mesh = zkRelocateMeshFor(this, drag.record.id); if (mesh) mesh.position.set(x, this.buildings.siteHeight(drag.record.type, x, z, this.terrain), z); }
    zkRelocateRender(this, drag.record, survey, x, z);
  };
  canvas.addEventListener("pointermove", this.onPointerMove);

  this.zkRelocatePointerUp = () => zkRelocateFinish(this, !0);
  this.zkRelocateKeyDown = (event) => { if (event.code === "Escape" && this.zkRelocateDrag) zkRelocateFinish(this, !1); };
  canvas.addEventListener("pointerup", this.zkRelocatePointerUp);
  canvas.addEventListener("pointercancel", this.zkRelocatePointerUp);
  window.addEventListener("keydown", this.zkRelocateKeyDown);
  return result;
};

const zkRelocateToggleMode = zR.prototype.toggleMode;
zR.prototype.toggleMode = function () {
  if (this.zkRelocateDrag) zkRelocateFinish(this, !1);
  return zkRelocateToggleMode.call(this);
};

const zkRelocateDispose = zR.prototype.dispose;
zR.prototype.dispose = function () {
  if (this.zkRelocateDrag) zkRelocateFinish(this, !1);
  const canvas = this.renderer?.domElement;
  canvas?.removeEventListener("pointerup", this.zkRelocatePointerUp);
  canvas?.removeEventListener("pointercancel", this.zkRelocatePointerUp);
  window.removeEventListener("keydown", this.zkRelocateKeyDown);
  document.getElementById("zeknova-relocate-readout")?.remove();
  if (this.zkRelocateRings) {
    this.zkRelocateRings.traverse((node) => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
    this.scene?.remove(this.zkRelocateRings);
    this.zkRelocateRings = null;
  }
  return zkRelocateDispose.call(this);
};

/* --- The Obsidian Demon Knight -------------------------------------------
   He had no movement function of his own, so he fell through to the generic
   orbit-lerp: a slow drift toward a point near the arena centre with no terrain
   awareness at all, which is exactly why he wedged himself between rocks and
   stayed there. He now gets a dedicated mover with obstacle probing, a five-fold
   speed increase, and the thing the orbit-lerp could never express - he leaves
   the ground. A leap carries him over whatever is in the way (airborne, so the
   obstacle test is skipped) and ends in a falling slice that detonates where he
   lands. Everything in this block is keyed to his config id; no other boss is
   affected. */
const ZK_KNIGHT_ID = "desert_cinder_scrapper";
const ZK_KNIGHT_SPEED_MULTIPLIER = 5;
const ZK_KNIGHT_PROJECTILE_MULTIPLIER = 5;
const ZK_KNIGHT_LEAP_DURATION = .78;
const ZK_KNIGHT_LEAP_HEIGHT = 7.5;

function zkKnightIsBoss(manager) { return manager?.config?.id === ZK_KNIGHT_ID; }

/** The falling slice: the leap's payload, fired the instant he touches down. */
function zkKnightSlamDown(manager) {
  const boss = manager.boss, game = manager.game;
  if (!boss || !game) return;
  const origin = boss.position.clone();
  origin.y = game.terrain.heightAt(origin.x, origin.z);
  const phase = manager.phase?.id;
  // The slice widens as he escalates: one ring in phase 1, a second faster ring
  // from phase 2, and a dense off-axis third in phase 3.
  zkBossRadial(manager.pool, origin, { count: 20, speed: 9.5, damage: 13, gapEvery: 5, patternId: "obsidian_falling_slice", color: manager.config.color, height: .8 });
  if (phase === "phase_2" || phase === "phase_3") {
    zkBossRadial(manager.pool, origin, { count: 16, speed: 15, damage: 11, offset: .19, gapEvery: 4, patternId: "obsidian_falling_slice", color: manager.config.color, height: 1.5 });
  }
  if (phase === "phase_3") {
    zkBossRadial(manager.pool, origin, { count: 24, speed: 20, damage: 12, offset: .38, gapEvery: 7, patternId: "obsidian_falling_slice", color: manager.config.color, height: 2.2 });
  }
  manager.game.ui?.shakeCamera?.(.5);
}

function zkMoveObsidianKnightBoss(manager, delta) {
  const boss = manager.boss, game = manager.game, player = game.player?.group?.position;
  if (!boss || !player) return !1;
  const step = Math.min(.08, Math.max(0, Number(delta) || 0));
  const toPlayer = player.clone().sub(boss.position);
  toPlayer.y = 0;
  const distance = Math.max(.001, toPlayer.length());
  const forward = toPlayer.multiplyScalar(1 / distance);
  const side = ((manager.seed + manager.attackIndex) & 1) ? 1 : -1;
  const tangent = new w(-forward.z, 0, forward.x).multiplyScalar(side);

  // --- Airborne phase ------------------------------------------------------
  const leapUntil = Number(manager.knightLeapUntil ?? 0);
  // Both endpoints are required: `elapsed` restarts at zero on a new encounter, so
  // a leap deadline left over from the previous fight can otherwise look active
  // while its endpoints have already been cleared.
  if (manager.elapsed < leapUntil && manager.knightLeapFrom && manager.knightLeapTo) {
    const progress = Kt.clamp(1 - (leapUntil - manager.elapsed) / ZK_KNIGHT_LEAP_DURATION, 0, 1);
    const from = manager.knightLeapFrom, to = manager.knightLeapTo;
    const x = Kt.lerp(from.x, to.x, progress), z = Kt.lerp(from.z, to.z, progress);
    // A parabola over the ground line, so he clears whatever he jumped over.
    const ground = Kt.lerp(game.terrain.heightAt(from.x, from.z), game.terrain.heightAt(to.x, to.z), progress);
    boss.position.set(x, ground + Math.sin(progress * Math.PI) * ZK_KNIGHT_LEAP_HEIGHT, z);
    manager.center.x = Kt.lerp(manager.center.x, x, Math.min(1, step * 1.25));
    manager.center.z = Kt.lerp(manager.center.z, z, Math.min(1, step * 1.25));
    manager.center.y = game.terrain.heightAt(manager.center.x, manager.center.z);
    return !0;
  }
  if (manager.knightLeapTo) {
    // Landed this frame: plant him and let the slice go.
    manager.knightLeapTo = null;
    manager.knightLeapFrom = null;
    boss.position.y = game.terrain.heightAt(boss.position.x, boss.position.z);
    zkKnightSlamDown(manager);
    manager.knightNextLeapAt = manager.elapsed + (manager.phase?.id === "phase_3" ? 2.6 : manager.phase?.id === "phase_2" ? 3.4 : 4.4);
  }

  // --- Decide whether to leap ---------------------------------------------
  const blockedFor = Number(manager.knightBlockedSince ?? 0);
  const stuck = blockedFor > 0 && manager.elapsed - blockedFor > .45;
  const readyToLeap = manager.elapsed >= Number(manager.knightNextLeapAt ?? 0);
  // The leap is an attack in its own right, not only a gap-closer, so it fires on
  // its timer at any range - at knife-fighting distance it becomes a pounce that
  // lands on top of the player. It also always frees him from a sustained snag,
  // which is the wedging bug this is here to end.
  if (readyToLeap || stuck) {
    const reach = stuck ? 14 : Kt.clamp(distance, 6, 26);
    const landing = boss.position.clone().addScaledVector(forward, reach);
    manager.knightLeapFrom = boss.position.clone();
    manager.knightLeapTo = new w(Kt.clamp(landing.x, -79, 79), 0, Kt.clamp(landing.z, -79, 79));
    manager.knightLeapUntil = manager.elapsed + ZK_KNIGHT_LEAP_DURATION;
    manager.knightBlockedSince = 0;
    manager.boss.userData.bossHqModel?.playAttack?.("obsidian_leap");
    return !0;
  }

  // --- Grounded pursuit ----------------------------------------------------
  let direction;
  if (distance > 9) direction = forward.clone().addScaledVector(tangent, .12);
  else if (distance < 3.6) direction = forward.clone().multiplyScalar(-.4).addScaledVector(tangent, .9);
  else direction = tangent.clone().multiplyScalar(.6).addScaledVector(forward, (distance - 5.4) * .4);
  direction.normalize();

  const phaseSpeed = manager.phase?.id === "phase_3" ? 6.6 : manager.phase?.id === "phase_2" ? 5.6 : 4.8;
  const speed = phaseSpeed * ZK_KNIGHT_SPEED_MULTIPLIER;
  const distanceStep = Math.min(2.6, speed * step);
  const angles = [0, .32, -.32, .7, -.7, 1.15, -1.15, 1.7, -1.7, Math.PI];
  const next = boss.position.clone();
  let chosen = !1;
  for (const angle of angles) {
    const candidate = direction.clone().applyAxisAngle(new w(0, 1, 0), angle);
    const x = Kt.clamp(boss.position.x + candidate.x * distanceStep, -79, 79);
    const z = Kt.clamp(boss.position.z + candidate.z * distanceStep, -79, 79);
    if (game.terrain.isWaterAt(x, z, .62) || game.terrain.isObstacleAt(x, z, .82)) continue;
    next.x = x; next.z = z; chosen = !0; break;
  }
  if (!chosen) {
    // Every heading is walled off. Start the stuck clock; the leap above frees him.
    if (!manager.knightBlockedSince) manager.knightBlockedSince = manager.elapsed;
    return !1;
  }
  manager.knightBlockedSince = 0;
  next.y = Kt.lerp(boss.position.y, game.terrain.heightAt(next.x, next.z), Math.min(1, step * 15));
  const moved = boss.position.distanceToSquared(next) > 1e-6;
  boss.position.copy(next);
  manager.center.x = Kt.lerp(manager.center.x, boss.position.x, Math.min(1, step * 1.25));
  manager.center.z = Kt.lerp(manager.center.z, boss.position.z, Math.min(1, step * 1.25));
  manager.center.y = game.terrain.heightAt(manager.center.x, manager.center.z);
  return moved;
}

/* His projectiles fly five times faster. The patterns themselves are shared with
   other bosses (sunscar_fastball, shale_bolt_fan and so on), so the multiplier is
   applied at acquire time against the live encounter rather than by editing any
   pattern - that keeps every other boss's shots at their tuned speed. Lifetime is
   divided by the same factor so a shot still covers the same ground and does not
   sail out of the arena. */
const zkKnightPoolAcquire = zkBossProjectilePool.prototype.acquire;
zkBossProjectilePool.prototype.acquire = function (options = {}) {
  if (!this.zkObsidianKnightActive || !options.velocity) return zkKnightPoolAcquire.call(this, options);
  const scaled = {
    ...options,
    velocity: options.velocity.clone().multiplyScalar(ZK_KNIGHT_PROJECTILE_MULTIPLIER),
    lifetime: Math.max(.35, Number(options.lifetime ?? 6) / ZK_KNIGHT_PROJECTILE_MULTIPLIER),
  };
  return zkKnightPoolAcquire.call(this, scaled);
};

/* The flag the multiplier above reads. Set it from the encounter so the pool has
   no knowledge of which boss owns it. */
const zkKnightStartEncounter = zkBossManager.prototype.startEncounter;
zkBossManager.prototype.startEncounter = function (options = {}) {
  const started = zkKnightStartEncounter.call(this, options);
  if (this.pool) this.pool.zkObsidianKnightActive = started && zkKnightIsBoss(this);
  // Reset the leap state so nothing carries over from a previous encounter.
  this.knightLeapUntil = 0;
  this.knightLeapFrom = null;
  this.knightLeapTo = null;
  // A short grace period so he does not open the fight mid-air.
  this.knightNextLeapAt = 2.2;
  this.knightBlockedSince = 0;
  this.drownedLeapUntil = 0;
  this.drownedLeapFrom = null;
  this.drownedLeapTo = null;
  this.drownedHoverUntil = 0;
  this.drownedNextHoverAt = 8;
  this.drownedBlockedSince = 0;
  return started;
};
const zkKnightCleanup = zkBossManager.prototype.cleanup;
zkBossManager.prototype.cleanup = function (...args) {
  if (this.pool) this.pool.zkObsidianKnightActive = !1;
  return zkKnightCleanup.apply(this, args);
};

/* Companion mech field autonomy. The mech remains physically attached to the
   officer rig, but independently selects work and combat targets around it. */
zR.prototype.updateMechAssist=function(){
  if(this.paused||this.mode!=="explore"||!this.player?.machine||!this.terrain||!this.simulation)return;
  const now=performance.now(),profile=mechAssistProfile(this.user.officerClass),playerPosition=this.player.group.position;
  const boss=this.bossManager?.active&&Number(this.bossManager.boss?.userData?.health)>0?this.bossManager.boss:null;
  let hostile=null,hostileDistance=Infinity;
  for(const enemy of this.enemies){
    if(enemy===boss||!enemy?.visible||!enemy.userData?.hostile||enemy.userData?.guardian||Number(enemy.userData.health)<=0)continue;
    const distance=enemy.position.distanceTo(playerPosition);
    if(distance<hostileDistance){hostile=enemy;hostileDistance=distance}
  }
  const ore=this.findNearestRock(profile.workRange),tree=this.findNearestTree(profile.workRange);
  const mode=mechAssistPriority({bossActive:!!boss&&boss.position.distanceTo(playerPosition)<=profile.bossRange,hostileDistance,oreDistance:ore?.distance??Infinity,treeDistance:tree?.distance??Infinity,range:profile.range,workRange:profile.workRange});
  this.player.machine.userData.assistMode=mode;
  if(mode!=="follow"&&!this.mechAssistAnnounced){this.mechAssistAnnounced=!0;this.ui.showToast("Mech field assist online","Companion priorities: boss defense, nearby hostiles, ore extraction, then timber harvesting.","success")}
  if(mode==="boss"||mode==="hostile"){
    if(now<Number(this.mechNextCombatAt??0))return;
    const target=mode==="boss"?boss:hostile;if(!target)return;
    this.mechNextCombatAt=now+profile.combatCooldown*1e3;
    const origin=new w;this.player.machine.getWorldPosition(origin);Number.isFinite(origin.y)||origin.copy(playerPosition).add(new w(0,2.2,0));
    const endpoint=target.position.clone().add(new w(0,mode==="boss"?3.2:1.35,0)),color=this.user.officerClass==="captain"?0x6ff2da:this.user.officerClass==="lieutenant"?0x5ca8ff:0xd9e85e;
    this.createBeamEffect(origin,endpoint,color);this.spawnImpactPulse(endpoint,color);this.player.playCombatAnimation("fire",profile.combatCooldown*.7);this.player.hqModels?.recoilWeapon?.("thunderclaw",.7);
    if(mode==="boss")this.damageWeaponTarget(target,profile.bossDamage,color,"mech-assist");
    else target.userData.health=Math.max(0,Number(target.userData.health)-profile.damage);
    this.mechAssistShots=Number(this.mechAssistShots??0)+1;
    return;
  }
  if(now<Number(this.mechNextWorkAt??0))return;
  if(mode==="ore"&&ore?.rock&&this.miningCooldownRemaining<=0){
    this.mechNextWorkAt=now+profile.workCooldown*1e3;this.player.playMineAnimation();this.mineRock(ore.rock);this.player.machine.userData.assistTarget="ore";return;
  }
  if((mode==="tree"||mode==="ore"&&this.miningCooldownRemaining>0)&&tree?.tree){
    this.mechNextWorkAt=now+profile.workCooldown*1e3;this.player.playMineAnimation();const origin=new w;this.player.machine.getWorldPosition(origin);this.createBeamEffect(origin,tree.tree.position.clone().add(new w(0,1.4,0)),0x94eccc);this.chopTree(tree.tree);this.player.machine.userData.assistTarget="tree";
  }
};

const zkMechAssistEnemyUpdate=zR.prototype.updateEnemies;
zR.prototype.updateEnemies=function(delta){const result=zkMechAssistEnemyUpdate.call(this,delta);this.updateMechAssist(delta);return result};

// Mission 2 Fresh Improvement Patch — filtration distinction, waypoint, checklist 1/5, hardening
(function(){
  const _addAOResources = PR.prototype.addAOResourceNodes;
  PR.prototype.addAOResourceNodes = function(){
    _addAOResources.call(this);
    const wetNodes = this.resourceNodes.filter(n=>n.userData.aoId==='wetlands' && n.userData.aoResource);
    const filt = wetNodes.slice(0,2);
    for(let i=0;i<filt.length;i++){
      const n=filt[i];
      n.userData.filtrationUnit=true;
      n.userData.filtrationIndex=i;
      n.scale.setScalar(1.38);
      try{ if(n.material){ n.material.emissive=new re(0xff8c3d); n.material.emissiveIntensity=3.8; } }catch{}
      const glow=new R(new tt(1.65,0.14,8,32), new Je({color:0xff8c3d, transparent:true, opacity:0.42}));
      glow.rotation.x=Math.PI/2; glow.position.y=0.62; glow.name="filtrationGlow";
      n.add(glow);
    }
    this.filtrationNodes=filt;
  };

  const _collect = zR.prototype.collectResource;
  const _zkCollect = zkAOCollectResource;
  zR.prototype.collectResource = function(node){
    if(node && node.userData && node.userData.aoId==='wetlands' && !node.userData.filtrationUnit){
      const ctx=this.getMissionContext?.(); let cur=null; try{ cur=ctx?zkCampaignState(ctx).current:null;}catch{}
      if(cur && cur.id==='water' && Number(this.aoResourceCollected?.wetlands||0) <2){
        // Generic wetlands resource should not count toward filtration mission — treat as normal resource only
        // Still allow collection for generic, but don't increment aoResourceCollected for mission gate beyond filtration units
        // Let generic collect as normal field resource without mission increment
        const isFilt = !!node.userData.filtrationUnit;
        if(!isFilt){
          // Call base collect without AO increment
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
    return _collect.call(this, node);
  };
  // Ensure filtration units cap at 2
  const _zkAOCollect = zR.prototype.collectResource;
  // (wrap again to cap)
  const _origAOCollect = zkAOCollectResource;
  // Patch the standalone zkAOCollectResource function closure via prototype wrap already handles aoResourceCollected increment;
  // Add cap after increment
  const _origCollect2 = zR.prototype.collectResource;
  zR.prototype.collectResource = function(node){
    const beforeWet = Number(this.aoResourceCollected?.wetlands||0);
    const res = _origCollect2.call(this, node);
    if(node && node.userData && node.userData.filtrationUnit){
      if(Number(this.aoResourceCollected?.wetlands||0) >2) this.aoResourceCollected.wetlands=2;
    }
    // Prevent exceed 2 for mission display
    return res;
  };

  const _updateResInteract = zR.prototype.updateResourceInteraction;
  zR.prototype.updateResourceInteraction = function(){
    _updateResInteract.call(this);
    try{
      const ctx=this.getMissionContext?.(); const cur=ctx?zkCampaignState(ctx).current:null;
      if(!cur || cur.id!=='water') return;
      const need = 2 - Number(this.aoResourceCollected?.wetlands||0);
      if(need<=0) return;
      const unrec = (this.terrain.resourceNodes||[]).filter(n=>n.userData.filtrationUnit && n.visible);
      if(!unrec.length) return;
      // waypoint: pulse glow
      for(const n of unrec){ const g=n.getObjectByName("filtrationGlow"); if(g) g.material.opacity=0.32+Math.sin(performance.now()*0.004 + Number(n.userData.filtrationIndex)*1.2)*0.18; }
      const nearest = unrec.reduce((a,b)=> a.position.distanceTo(this.player.group.position) < b.position.distanceTo(this.player.group.position) ? a : b);
      const dist = nearest.position.distanceTo(this.player.group.position);
      if(dist < 42){
        const prompt=document.getElementById("interaction-prompt");
        if(prompt && this.nearestResource===nearest){
          prompt.innerHTML = `DAMAGED FILTRATION UNIT — PRESS <kbd>E</kbd> TO RECOVER · ${dist.toFixed(1)}m · ${need} remaining`;
          prompt.classList.remove("hidden");
        }
        // If not nearest but within 40m, still show waypoint hint via toast throttled
        if(dist<40 && this.nearestResource!==nearest && performance.now() - Number(this._filtWaypointAt||0) > 8000){
          this._filtWaypointAt=performance.now();
          this.ui.showToast("Filtration unit nearby", `Damaged filtration unit ${dist.toFixed(0)}m away in Wetlands AO — look for glowing orange ring.`, "info");
        }
      }
    }catch{}
  };

  // Checklist usability: aggregate Water Works 1/5
  const _updHud = zR.prototype.updateHud;
  zR.prototype.updateHud = function(e){
    const r=_updHud.call(this,e);
    try{
      const ctx=e?.missionContext || this.getMissionContext?.();
      const camp=ctx?zkCampaignState(ctx):null; const mission=camp?.current;
      if(mission && mission.id==='water'){
        const list=document.getElementById("sub-objective-list");
        if(list){
          const waterObjs=(mission.subObjectives||[]).filter(o=>o.key==='water' && o.kind==='biomeBuilding');
          if(waterObjs.length===5){
            const done=waterObjs.filter(o=>zkObjectiveComplete(o,ctx)).length;
            let summary=list.querySelector("[data-water-summary]");
            if(!summary){
              summary=document.createElement("li");
              summary.dataset.waterSummary="true";
              summary.style.fontWeight="800";
              summary.style.borderBottom="1px solid rgba(112,230,255,0.22)";
              summary.style.background="rgba(85,230,255,0.06)";
              list.prepend(summary);
            }
            summary.className = done===5?"complete":"";
            summary.innerHTML=`<span>${done===5?"✓":"○"}</span><b>Water Works: ${done}/5 — one per AO</b><small>${done}/5</small>`;
            // Hide individual water lines behind summary when collapsed, keep expand on click
            // No removal — just ensure summary is first
          }
        }
      }
    }catch{}
    return r;
  };

  // Persistence: hide already-collected filtration units after terrain load / restore
  const _origRestore = zR.prototype.restore;
  zR.prototype.restore = function(e){
    const r=_origRestore.call(this,e);
    try{
      const collected = Number(this.aoResourceCollected?.wetlands||0);
      const nodes = this.terrain?.resourceNodes||[];
      const filts = nodes.filter(n=>n.userData.filtrationUnit);
      for(let i=0;i<Math.min(collected, filts.length); i++){ filts[i].visible=false; const g=filts[i].getObjectByName("filtrationGlow"); if(g) g.visible=false; }
      if(collected>=2){ for(const n of nodes.filter(n=>n.userData.filtrationUnit)) n.visible=false; }
    }catch{}
    return r;
  };
  const _origLoadAO = zkLoadAOState;
  // Also on terrain ready, hide if already collected (for clean-start after reload)
  const _origInit = zR.prototype.initialize;
  zR.prototype.initialize = async function(){
    const res=await _origInit.apply(this, arguments);
    try{
      const c=Number(this.aoResourceCollected?.wetlands||0);
      const nodes=this.terrain?.resourceNodes||[];
      const filts=nodes.filter(n=>n.userData.filtrationUnit);
      for(let i=0;i<Math.min(c, filts.length); i++){ filts[i].visible=false; }
    }catch{}
    return res;
  };

  console.log("Mission 2 Fresh Improvement Patch applied — filtration distinction, waypoint, Water Works 1/5 summary");
})();

/* Sentinel Picasso combat refinement. Projectile records remain authoritative in
   their existing pools; this layer only changes pooled meshes, trails, impacts,
   telegraphs, and beam presentation. The Ensign beam's damage/knockback lives in
   zkApplyEnsignBeamGameplay below, deliberately outside Picasso's R0 profile. */
