/** Independent game rules depend only on the public SDK scene/system contracts. */
export function installOutpost(engine,input,orientation=null){
 const basis=()=>{if(orientation?.getMovementBasis){const b=orientation.getMovementBasis();if(b&&Number.isFinite(b.forward?.[0]))return b;}if(orientation&&Array.isArray(orientation.forward)&&Number.isFinite(orientation.forward[0]))return{forward:orientation.forward.slice(0,2),right:orientation.right.slice(0,2)};return{forward:[0,0,1],right:[1,0,0]};};
 engine.registerSystem({id:'outpost-motion-and-objective',run(world,dt,{events}){
  const pilot=world.findEntity('pilot');if(!pilot?.components.state)return;const t=pilot.components.transform,state=pilot.components.state;
  const fwd=((input.has('w')||input.has('ArrowUp'))?1:0)-((input.has('s')||input.has('ArrowDown'))?1:0),strafe=((input.has('d')||input.has('ArrowRight'))?1:0)-((input.has('a')||input.has('ArrowLeft'))?1:0);
  if(fwd||strafe){const b=basis(),l=Math.hypot(fwd,strafe)||1,dx=(b.forward[0]*fwd+b.right[0]*strafe)/l*dt*3,dz=(b.forward[1]*fwd+b.right[1]*strafe)/l*dt*3;const p=[Math.max(-6,Math.min(6,t.position[0]+dx)),t.position[1],Math.max(-6,Math.min(6,t.position[2]+dz))];
   const blocked=world.entities().some(e=>{const c=e.components.collider,q=e.components.transform;return c&&q&&Math.abs(p[0]-q.position[0])<c.halfSize[0]+.35&&Math.abs(p[2]-q.position[2])<c.halfSize[2]+.35;});if(!blocked)world.updateTransform('pilot',{position:p});
  }
  const cell=world.findEntity('cell');if(cell&&Math.hypot(t.position[0]-cell.components.transform.position[0],t.position[2]-cell.components.transform.position[2])<.9){world.commit(world.changeset([{type:'DeleteEntity',id:'cell',expectedExists:true},{type:'UpdateComponent',id:'pilot',component:'state',value:{...state,resources:1,objective:'Press B to build the antenna'},expectedExists:true}]));events.emit('game:rule',{rule:'collected-cell',entity:'pilot'});}
  const antenna=world.findEntity('antenna');if(input.has('b')&&state.resources>0&&antenna&&!antenna.components.state.built){world.commit(world.changeset([{type:'UpdateComponent',id:'pilot',component:'state',value:{...state,resources:0,objective:'Outpost online — objective complete'},expectedExists:true},{type:'UpdateComponent',id:'antenna',component:'state',value:{buildable:true,built:true},expectedExists:true},{type:'UpdateTransform',id:'antenna',value:{position:[4,1.5,-3],scale:[.4,3,.4]},expectedExists:true}]));events.emit('game:rule',{rule:'outpost-online',entity:'pilot'});}
 }});
}
