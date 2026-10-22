import subprocess,os,json,pathlib,time
out=pathlib.Path('/tmp/zge08-evidence/browser-certified');env=dict(os.environ, PLAYWRIGHT_MODULE='/Users/dwaynecampbell/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',ZGE_EVIDENCE_DIR=str(out),RESULT_PATH=str(out/'live-performance-final.json')); rows=[]
for script in ['zge07-browser-certification.mjs','zge04-browser-parity.mjs','zge04-browser-live-flow.mjs','zge03-browser-followup.mjs','zge04-browser-demo.mjs','zge05-browser-demo.mjs','zge04-browser-performance.mjs']:
 start=time.monotonic()
 with (out/(script+'.log')).open('w') as log:
  try: result=subprocess.run(['node','scripts/'+script],env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600); code=result.returncode
  except subprocess.TimeoutExpired:code=124
 rows.append({'script':script,'exit':code,'ms':round((time.monotonic()-start)*1000)})
 (out/'browser-runs.json').write_text(json.dumps(rows,indent=2))
 print(script,code,flush=True)
