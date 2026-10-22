import{startSupervisor}from'../../runtime/supervisor.mjs';
const service=await startSupervisor({socketPath:process.env.ZGE_RUNTIME_SOCKET,keyPath:process.env.ZGE_RUNTIME_KEY_FILE,dbPath:process.env.ZGE_STAGING_DB,leaseMs:1400,heartbeatMs:300,timeoutMs:500,recoverStaleSocket:true});
process.stdout.write('ready\n');for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>service.close().then(()=>process.exit(0)));
