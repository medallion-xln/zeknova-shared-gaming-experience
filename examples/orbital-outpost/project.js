import { transform } from '@zge/sdk';
const entity=(id,name,position,scale,color,state={},collider=false)=>({id,name,components:{transform:transform({position,scale}),mesh:{primitive:'box',color},state,...(collider?{collider:{halfSize:scale.map(n=>n/2)}}:{})}});
export const project={schema:'zge.sdk.project.v1',id:'orbital-outpost',name:'Orbital Outpost',entryWorld:'main',assets:[],plugins:['outpost-rules'],prefabs:{crate:{name:'Supply crate',components:{transform:transform({position:[0,.5,0]}),mesh:{primitive:'box',color:'#d9ac67'},state:{buildable:true}}}},worlds:{main:{schema:'zge.sdk.scene.v1',id:'main',revision:0,nextId:1,entities:[
 entity('platform','Landing platform',[0,-.3,0],[14,.5,14],'#394757'),
 entity('pilot','Explorer',[-4,.5,0],[.7,1,.7],'#84c7df',{controlled:true,resources:0,objective:'Collect the cell, then build an antenna'}),
 entity('barrier','Cargo barrier',[0,.5,0],[1,1,3],'#737a86',{},true),
 entity('cell','Energy cell',[-2,.35,-2],[.5,.7,.5],'#e1c579',{collectible:true}),
 entity('antenna','Antenna foundation',[4,.15,-3],[1.5,.3,1.5],'#83a992',{buildable:true,built:false})
]}}};
