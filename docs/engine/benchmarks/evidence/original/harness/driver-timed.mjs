import fs from 'node:fs';
import {chromium} from '/Users/dwaynecampbell/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
globalThis.fs=fs;globalThis.browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu','--enable-precise-memory-info']});
globalThis.ctx=await browser.newContext({viewport:{width:1440,height:1000}});globalThis.page=await ctx.newPage();globalThis.errors=[];globalThis.warnings=[];globalThis.saves=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text())});
page.on('response',async r=>{if(r.url().includes('/api/save.php')&&r.request().method()==='POST'){let body;try{body=await r.json()}catch{};saves.push({at:Date.now(),status:r.status(),timing:r.request().timing(),body});}});
console.log('DRIVER_READY');
for(let i=7;;i++){let p='/tmp/zge-bench01/command-'+i+'.mjs';while(!fs.existsSync(p))await new Promise(r=>setTimeout(r,100));let result;try{result=await new (Object.getPrototypeOf(async function(){}).constructor)(fs.readFileSync(p,'utf8'))();}catch(e){result={error:e.stack}}fs.writeFileSync('/tmp/zge-bench01/result-'+i+'.json',JSON.stringify(result??null,null,2));console.log('COMMAND_DONE',i);if(fs.existsSync('/tmp/zge-bench01/stop'))break;}
await browser.close();
