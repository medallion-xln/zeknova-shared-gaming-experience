/** Independent game rules depend only on the public SDK scene/system contracts. */
export function installOutpost(engine,input){
 engine.registerSystem({id:'outpost-motion-and-objective',run(world,dt,{events}){
  const pilot=world.findEntity('pilot');if(!pilot?.components.state)return;const t=pilot.components.transform,state=pilot.components.state;
  const dx=((input.has('ArrowRight')||input.has('d'))?1:0)-((input.has('ArrowLeft')||input.has('a'))?1:0),dz=((input.has('ArrowDown')||input.has('s'))?1:0)-((input.has('ArrowUp')||input.has('w'))?1:0);
  if(dx||dz){const p=[Math.max(-6,Math.min(6,t.position[0]+dx*dt*3)),t.position[1],Math.max(-6,Math.min(6,t.position[2]+dz*dt*3))];
   const blocked=world.entities().some(e=>{const c=e.components.collider,q=e.components.transform;return c&&q&&Math.abs(p[0]-q.position[0])<c.halfSize[0]+.35&&Math.abs(p[2]-q.position[2])<c.halfSize[2]+.35;});if(!blocked)world.updateTransform('pilot',{position:p});
  }
  const cell=world.findEntity('cell');if(cell&&Math.hypot(t.position[0]-cell.components.transform.position[0],t.position[2]-cell.components.transform.position[2])<.9){world.commit(world.changeset([{type:'DeleteEntity',id:'cell',expectedExists:true},{type:'UpdateComponent',id:'pilot',component:'state',value:{...state,resources:1,objective:'Press B to build the antenna'},expectedExists:true}]));events.emit('game:rule',{rule:'collected-cell',entity:'pilot'});}
  const antenna=world.findEntity('antenna');if(input.has('b')&&state.resources>0&&antenna&&!antenna.components.state.built){world.commit(world.changeset([{type:'UpdateComponent',id:'pilot',component:'state',value:{...state,resources:0,objective:'Outpost online — objective complete'},expectedExists:true},{type:'UpdateComponent',id:'antenna',component:'state',value:{buildable:true,built:true},expectedExists:true},{type:'UpdateTransform',id:'antenna',value:{position:[4,1.5,-3],scale:[.4,3,.4]},expectedExists:true}]));events.emit('game:rule',{rule:'outpost-online',entity:'pilot'});}
 }});
}
