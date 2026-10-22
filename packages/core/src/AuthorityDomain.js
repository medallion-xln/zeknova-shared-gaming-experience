import {immutableData} from './WorldState.js';
/** Synchronous single-writer dispatch for cooperating ports. ENGINE activation
 * is deliberately restricted to isolated local fixtures, never the live bundle. */
export class AuthorityDomain {
  #mode; #epoch=0; #writers=new Map(); #active=false; #currentWriter=null; #disposed=false; #localFixture; #ledger=new Map();
  constructor({domain,mode='LEGACY',localFixture=false}={}) {
    if(!domain||!['LEGACY','SHADOW'].includes(mode))throw new Error('authority must start LEGACY or SHADOW');
    this.domain=domain;this.#mode=mode;this.#localFixture=localFixture;
  }
  get mode(){return this.#mode;} get epoch(){return this.#epoch;} get active(){return this.#active;}
  get writers(){return new Map(this.#writers);}
  register(mode,owner,run) {
    if(this.#disposed||!['LEGACY','ENGINE'].includes(mode)||!owner||typeof run!=='function'||run.constructor.name==='AsyncFunction'||this.#writers.has(mode))throw new Error('authority writer conflict');
    const entry=Object.freeze({owner,run:command=>{
      if(!this.#active||this.#currentWriter!==entry||this.#writers.get(this.#mode==='ENGINE'?'ENGINE':'LEGACY')!==entry)throw new Error('inactive authority writer');return run(command);
    }});
    this.#writers.set(mode,entry);return ()=>{if(this.#active)throw new Error('authority transaction in progress');if(this.#writers.get(mode)===entry)this.#writers.delete(mode);};
  }
  transition(mode,{validateMigration=()=>true,state={},certified=false}={}) {
    if(this.#disposed||this.#active)throw new Error('authority unavailable during transaction');
    if(!['LEGACY','SHADOW','ENGINE'].includes(mode))throw new Error('invalid authority');
    if(mode==='ENGINE'&&(!this.#localFixture||!certified||!this.#writers.has('ENGINE')||this.#mode!=='SHADOW'))throw new Error('engine authority not certified for this boundary');
    if(validateMigration(immutableData(state))!==true)throw new Error('state migration rejected');
    this.#mode=mode;this.#epoch++;return this.status();
  }
  execute(command,{epoch=this.#epoch}={}) {
    if(this.#disposed||this.#active)throw new Error('authority transaction in progress or disposed');
    if(epoch!==this.#epoch)throw new Error('stale authority epoch');
    const id=command.commandId??command.id;if(!id)throw new Error('authority command id required');
    const fingerprint=JSON.stringify(command,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
    const prior=this.#ledger.get(id);if(prior){if(prior.fingerprint!==fingerprint)throw new Error('authority idempotency conflict');return structuredClone(prior.result);}
    const writer=this.#writers.get(this.#mode==='ENGINE'?'ENGINE':'LEGACY');if(!writer)throw new Error('authority writer missing');
    this.#active=true;this.#currentWriter=writer;
    try{const result=writer.run(immutableData(command));if(result?.then)throw new Error('authority handlers must be synchronous');const value=immutableData(result??null);this.#ledger.set(id,{fingerprint,result:value});return structuredClone(value);}finally{this.#active=false;this.#currentWriter=null;}
  }
  snapshot(){return immutableData({schema:'zge.authority-domain.v1',domain:this.domain,ledger:[...this.#ledger]});}
  restore(snapshot){if(this.#active||this.#disposed)throw new Error('authority unavailable');const data=immutableData(snapshot);if(data.schema!=='zge.authority-domain.v1'||data.domain!==this.domain||!Array.isArray(data.ledger)||new Set(data.ledger.map(([id])=>id)).size!==data.ledger.length)throw new Error('invalid authority journal');this.#ledger=new Map(data.ledger);this.#epoch++;}
  status(){return {domain:this.domain,mode:this.#mode,epoch:this.#epoch,writer:this.#writers.get(this.#mode==='ENGINE'?'ENGINE':'LEGACY')?.owner??null,inFlight:this.#active,localFixture:this.#localFixture};}
  dispose(){if(this.#active)throw new Error('authority transaction in progress');this.#disposed=true;this.#writers.clear();this.#ledger.clear();}
}
