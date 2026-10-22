/** Samples current intent, not queued authoritative receipts. No prediction or state mutation. */
export class MovementSampler {
 constructor({send,population=()=>1,now=()=>performance.now(),onSample=()=>{},intervalMs=null}){Object.assign(this,{send,population,now,onSample,intervalMs});this.next=0;this.busy=false;this.samples=[];this.sent=0;}
 interval(){return this.intervalMs??Math.max(400,Math.min(64,Math.max(1,this.population()))*150);}
 async sample(dx,dz){const at=this.now();if(this.busy||at<this.next||(!dx&&!dz))return false;this.busy=true;this.next=at+this.interval();const length=Math.hypot(dx,dz);const row={sampleAt:at,issuedAt:this.now(),dx,dz};try{const result=await this.send(dx/length*.4,dz/length*.4);row.ackAt=this.now();row.ok=true;row.accepted=result?.ok!==false;if(!row.accepted)row.reason=result.reason;this.sent++;return true;}catch(e){row.ackAt=this.now();row.ok=false;row.reason=e.message;return false;}finally{this.busy=false;this.samples.push(row);if(this.samples.length>2048)this.samples.shift();this.onSample(row);}}
}
