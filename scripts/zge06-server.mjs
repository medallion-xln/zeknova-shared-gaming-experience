import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const directory=path.resolve(process.env.ZGE_STAGING_DIR || '/tmp/zge06-world');if(!directory.startsWith('/tmp/'))throw Error('Staging data must be under /tmp');mkdirSync(directory,{recursive:true,mode:0o700});
const port=Number(process.env.ZGE_STAGING_PORT || 8796);const env={...process.env,ZEKNOVA_ENV:'zge-staging',ZGE_STAGING_ENABLED:'1',ZGE_STAGING_DB:directory+'/world.sqlite',ZGE_STAGING_IDENTITIES:directory+'/identities.json',ZGE_NODE_PATH:process.execPath};
const setup=spawnSync('php',['packages/server-php/src/setup.php'],{env,encoding:'utf8'});if(setup.status!==0)throw Error('Staging initialization failed: '+setup.stderr);
console.log(`Isolated staging world: http://127.0.0.1:${port}/examples/construction-world/?server=1`);console.log('Fixture identity file: '+env.ZGE_STAGING_IDENTITIES);
const child=spawn('php',['-S','127.0.0.1:'+port,'packages/server-php/src/router.php'],{env,stdio:'inherit'});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exitCode=code??0);
