import subprocess,os,pathlib,time,json,urllib.request
out=pathlib.Path('/tmp/zge11-evidence/browser-regression');out.mkdir(parents=True,exist_ok=True);env=dict(os.environ,PLAYWRIGHT_MODULE='/Users/dwaynecampbell/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',ZGE_EVIDENCE_DIR=str(out),RESULT_PATH=str(out/'live-performance.json'));dev=None;rows=[]
try:
 try:urllib.request.urlopen('http://127.0.0.1:8790/',timeout=2)
 except Exception:
  dev=subprocess.Popen(['node','scripts/dev.mjs'],stdout=(out/'owned-dev.log').open('w'),stderr=subprocess.STDOUT)
  for i in range(100):
   try:urllib.request.urlopen('http://127.0.0.1:8790/',timeout=1);break
   except Exception:time.sleep(.1)
 for script in ['zge09-browser-world.mjs','zge07-browser-server.mjs','zge07-browser-certification.mjs','zge04-browser-parity.mjs','zge08-browser-live-flow.mjs','zge03-browser-followup.mjs','zge04-browser-demo.mjs','zge05-browser-demo.mjs','zge04-browser-performance.mjs']:
  start=time.monotonic()
  with (out/(script+'.log')).open('w') as log:
   try:r=subprocess.run(['node','scripts/'+script],env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  rows.append({'script':script,'exit':code,'ms':round((time.monotonic()-start)*1000)});(out/'browser-runs.json').write_text(json.dumps(rows,indent=2));print(script,code,flush=True)
finally:
 if dev:dev.terminate();dev.wait(timeout=10)
