/** Pure objective evaluator; rewards are proposed data, never applied here. */
export function evaluateMission(definition, state, facts) {
  const next = structuredClone(state);
  if (next.status === 'complete') return { state: next, events: [], rewards: [] };
  if (!(definition.prerequisites ?? []).every(id => facts.completed?.includes(id))) return { state: { ...next, status: 'locked' }, events: [], rewards: [] };
  const progress = (definition.objectives ?? []).map(o => {
    const value = Number(facts.values?.[o.key] ?? 0);
    if (!Number.isFinite(o.target) || o.target < 0 || !Number.isFinite(value)) throw new TypeError('invalid mission condition');
    return { id: o.id, value, target: o.target, complete: value >= o.target };
  });
  next.progress = progress; next.status = progress.every(o => o.complete) ? 'complete' : 'active';
  return { state: next, events: [{ type: next.status === 'complete' ? 'mission:complete' : 'mission:progress', id: definition.id, progress }], rewards: next.status === 'complete' ? structuredClone(definition.rewards ?? []) : [] };
}

/** Progress → completion → reward eligibility, with a durable command ledger.
 * Eligibility is a proposal; no inventory/reward authority is exercised here. */
export function reduceMission(definition, state, command) {
  const next=structuredClone(state);next.commands??=[];
  if(!command.id)throw new TypeError('mission command id required');
  const prior=next.commands.find(c=>c.id===command.id);
  if(prior)return {state:next,duplicate:true,conflict:prior.fingerprint!==JSON.stringify(command),events:[],rewards:[]};
  const evaluated=evaluateMission(definition,next,command.facts??{});evaluated.state.commands=next.commands; evaluated.state.commands.push({id:command.id,fingerprint:JSON.stringify(command)});
  const events=[];
  if(next.status!=='complete'&&evaluated.state.status!=='locked'){
    for(const progress of evaluated.state.progress)events.push({type:'objective:progress',missionId:definition.id,...progress});
    if(evaluated.state.status==='complete'){events.push({type:'mission:complete',missionId:definition.id});if(evaluated.rewards.length)events.push({type:'mission:reward-eligible',missionId:definition.id});}
  }
  return {...evaluated,events};
}
