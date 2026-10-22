import net from 'node:net';import{readFile}from'node:fs/promises';import{randomUUID}from'node:crypto';
export async function runtimeRequest({socketPath,keyPath,timeoutMs=7000},op,input={}){
 const key=(await readFile(keyPath,'utf8')).trim(),id=randomUUID();
 return new Promise((resolve,reject)=>{const socket=net.createConnection(socketPath);let output='',settled=false;const fail=reason=>{if(!settled){settled=true;socket.destroy();reject(Error(reason));}};socket.setTimeout(timeoutMs,()=>fail('runtime-timeout'));socket.on('error',()=>fail('runtime-unavailable'));socket.on('connect',()=>socket.write(JSON.stringify({version:1,id,key,op,input})+'\n'));socket.on('data',chunk=>{output+=chunk;if(output.length>8*1024*1024)fail('runtime-frame-limit');});socket.on('end',()=>{try{const response=JSON.parse(output);if(response.id!==id||!response.ok)throw Error(response.reason??'runtime-response-invalid');if(!settled){settled=true;resolve(response.data);}}catch(error){fail(error.message);}});});
}
