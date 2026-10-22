import subprocess,pathlib,json,time
root=pathlib.Path.cwd(); dest=pathlib.Path('/tmp/zge10-evidence'); label=__import__('sys').argv[1]; results=[]
files=sorted(set(root.glob('tests/*.test.mjs'))|set(root.glob('tests/*.test.cjs')))+[root/'tests/picasso-performance-report.mjs']
for p in files:
 start=time.monotonic()
 try:
  r=subprocess.run(['node',str(p)],capture_output=True,text=True,timeout=180); code=r.returncode; output=r.stdout+r.stderr
 except subprocess.TimeoutExpired as e: code=124; output=str(e)
 results.append({'file':str(p.relative_to(root)),'exit':code,'ms':round((time.monotonic()-start)*1000)})
 with (dest/(label+'.log')).open('a') as f: f.write('\n'+str(p.relative_to(root))+'\n'+output)
 (dest/(label+'.json')).write_text(json.dumps(results,indent=2))
print(json.dumps({'total':len(results),'passed':sum(r['exit']==0 for r in results),'failures':[r for r in results if r['exit']]}))
