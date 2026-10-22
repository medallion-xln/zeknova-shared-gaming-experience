/** Pure damage proposal. No live health, projectile, boss or mission mutations. */
export function evaluateDamage(target, command, { validateHit = () => true, projectileOwner = null } = {}) {
  if (!Number.isFinite(command.amount) || command.amount < 0 || !Number.isFinite(target.health) || target.health < 0) return { ok: false, reason: 'invalid-damage' };
  if (command.targetId !== target.id || (projectileOwner != null && projectileOwner !== command.sourceId) || !validateHit(structuredClone(target), structuredClone(command))) return { ok: false, reason: 'invalid-hit' };
  if (target.health === 0) return { ok: false, reason: 'already-dead' };
  const health = Math.max(0, target.health-command.amount), damage = target.health-health;
  const state = { ...structuredClone(target), health, effects: [...(structuredClone(target.effects ?? [])), ...(structuredClone(command.effects ?? []))] };
  const events = [{ type: 'combat:damage', targetId: target.id, sourceId: command.sourceId, damage, health }];
  if (health === 0) events.push({ type: 'combat:death', targetId: target.id, sourceId: command.sourceId });
  return { ok: true, state, damage, events };
}

/** Serializable pure command reduction; caller decides whether to apply proposal. */
export function reduceCombat(state, command, options = {}) {
  const next=structuredClone(state),prior=(next.ledger??[]).find(e=>e.id===command.id);
  if(!command.id)return {ok:false,reason:'command-id-required',state:next,events:[]};
  if(prior)return {ok:prior.fingerprint===JSON.stringify(command),duplicate:true,reason:prior.fingerprint===JSON.stringify(command)?'duplicate':'idempotency-conflict',state:next,events:[]};
  const target=next.targets.find(t=>t.id===command.targetId);if(!target)return {ok:false,reason:'illegal-target',state:next,events:[]};
  const result=evaluateDamage(target,command,options);if(!result.ok)return {...result,state:next,events:[]};
  next.targets=next.targets.map(t=>t.id===target.id?result.state:t);next.revision=(next.revision??0)+1;next.ledger??=[];next.ledger.push({id:command.id,fingerprint:JSON.stringify(command)});next.events=[...(next.events??[]),...result.events];
  return {...result,state:next};
}
