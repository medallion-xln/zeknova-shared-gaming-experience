"""Real-data charts; run in a temporary environment with matplotlib, no repo dependency changes."""
import json,pathlib,math,statistics,hashlib,os
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT=pathlib.Path.cwd(); TMP=pathlib.Path(os.environ.get('ZGE12_DATA','/tmp/zge12')); TMP=TMP if TMP.exists() else ROOT/'docs/engine/evidence/zge12'; D=ROOT/'docs/engine/evidence/zge12/charts'; B=ROOT/'docs/engine/benchmarks/charts';D.mkdir(parents=True,exist_ok=True);B.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'figure.dpi':120,'savefig.dpi':150})
def read(p):
 p=pathlib.Path(p)
 if not p.exists() and str(p).startswith('/tmp/zge-bench01/'):
  rel=str(p)[len('/tmp/zge-bench01/'):]; candidates=[ROOT/'docs/engine/benchmarks/evidence'/rel,ROOT/'docs/engine/benchmarks/evidence/original'/rel]
  p=next((x for x in candidates if x.exists()),p)
 return json.loads(p.read_text())
def save(folder,name,title,xlabel,ylabel,draw,note=''):
 fig,ax=plt.subplots(figsize=(9,4.8));draw(ax);ax.set(title=title,xlabel=xlabel,ylabel=ylabel);ax.grid(alpha=.18);fig.subplots_adjust(bottom=.2);fig.text(.09,.035,note,fontsize=8,wrap=True);fig.savefig(folder/(name+'.png'));plt.close(fig)
def q(a,p):
 a=sorted(a);return a[max(0,math.ceil(len(a)*p)-1)] if a else float('nan')
def frame(a):return {'fps':1000/statistics.mean(a),'p50':q(a,.5),'p95':q(a,.95),'p99':q(a,.99),'low':1000/statistics.mean(sorted(a)[-math.ceil(len(a)*.01):]),'max':max(a),'n':len(a)}
rows=read(TMP/'large-scenes/results.json');derived=[]
for r in rows:
 a=[v for t in r['trials'] for v in t['frames']];timings=r['timings'];select=[x['ms'] for x in timings if x['label'].startswith('select')];derived.append({'n':r['n'],'backend':r['metrics']['backend'],'frames':frame(a),'selectionP95Ms':q(select,.95),'selectionP50Ms':q(select,.5),'saveMs':next(x['ms'] for x in timings if x['label']=='save project'),'exportMs':next(x['ms'] for x in timings if x['label']=='export project download'),'loadMs':timings[0]['ms'],'reloadMs':timings[-1]['ms'],'parseMs':r['parsePublicApiMs'],'viewportInitMs':r['viewportInitMs'],'heapMiB':r['metrics']['heap']/1048576,'dom':r['metrics']['dom'],'gizmo':r['gizmo'],'errors':r['errors'],'interactionP95Ms':q([x['ms'] for x in timings[1:-3]],.95)})
(TMP/'large-scenes/summary.json').write_text(json.dumps(derived,indent=2))
def lines(ax,key,label=None):
 for b,c in [('webgpu','#247d89'),('webgl','#cc7832')]:
  a=[r for r in derived if r['backend']==b];ax.plot([r['n'] for r in a],[r['frames'][key] if key in r['frames'] else r[key] for r in a],'o-',color=c,label=b+(label or ''))
 ax.set_xscale('log');ax.set_xticks([100,500,1000,5000],labels=['100','500','1,000','5,000']);ax.legend()
for name,title,key,unit in [('fps-vs-size','Studio: mixed scene frame rate','fps','RAF average FPS'),('selection-vs-size','Studio: physical selection + inspector latency','selectionP95Ms','p95 input-to-ready upper bound (ms)'),('memory-vs-size','Studio: sampled editor heap by scene size','heapMiB','Used JS heap (MiB; no forced GC)'),('save-vs-size','Studio: complete project save latency','saveMs','Physical Save-to-ready upper bound (ms)'),('export-vs-size','Studio: complete project export latency','exportMs','Physical Export-to-download upper bound (ms)')]:
 save(D,name,title,'Entity count',unit,lambda ax,k=key:lines(ax,k),'Two 10s trials/backend/size after physical editing. Mixed primitives + 4% static GLB; 60Hz headless.\nInputs include driver/polling/two RAFs. Source-frozen final matrix under declared eight-player staging background load.')
heap=read(TMP/'retention/summary.json');save(D,'isolated-heap','Isolated evaluator: post-GC heap and compiled-code statistics','Checkpoint','MiB',lambda ax:(ax.plot([s['label'] for s in heap['samples']],[s['heap']['heapUsed']/1048576 for s in heap['samples']],'o-',label='Used heap'),ax.plot([s['label'] for s in heap['samples']],[s['code']['code_and_metadata_size']/1048576 for s in heap['samples']],'o-',label='V8 code + metadata'),ax.tick_params(axis='x',rotation=20),ax.legend()),'Synthetic 21,000 moves + 1,000 replay reads; no HTTP/SQLite. Forced GC only in isolated checkpoints.\nClass/path summaries and allocation samples are separate; used heap is not retained size.')
O=TMP/'operations/mixed-1500s.json'
if O.exists():
 op=read(O);samples=op['samples'];(TMP/'operations/chart-schema.json').write_text(json.dumps({'keys':list(op),'sampleKeys':list(samples[0])},indent=2))
 traces=[json.loads(x) for x in (TMP/'operations/mixed-1500s-traces.ndjson').read_text().splitlines()];lat=[r['totalMs'] for r in traces];save(D,'latency-histogram','Eight-player sustained mixed workload: request latency','End-to-end time (ms; logarithmic)','HTTP requests',lambda ax:(ax.hist(lat,bins=np.geomspace(max(.1,min(lat)),max(lat)*1.01,60),color='#247d89'),ax.set_xscale('log'),ax.axvline(q(lat,.99),color='#c45541',label=f'p99 {q(lat,.99):.2f}ms'),ax.legend()),f"Actual authorized HTTP, WAL/FULL, unchanged quotas. Duration {op['durationMs']/1000:.3f}s.\nLoopback host; benchmark/test interference disclosed. No population cap or SLA inferred.")
 save(D,'latency-outliers','Sustained workload: latency and rare outliers','Elapsed minutes','End-to-end time (ms)',lambda ax:ax.scatter([r['elapsedMs']/60000 for r in traces],lat,s=3,alpha=.45,color='#247d89'),'All requests shown. Exact stage spans retained; coarse GC correlation does not establish kernel I/O cause.')
 buckets={}
 for r in traces:
  minute=int(r['elapsedMs']/10000);buckets.setdefault(minute,{'http':0,'accepted':0});buckets[minute]['http']+=1;buckets[minute]['accepted']+=r['accepted'] is True
 save(D,'sustained-throughput','Sustained mixed workload: throughput in 10-second buckets','Elapsed minutes','Requests or accepted commands / second',lambda ax:(ax.plot([k/6 for k in buckets],[v['http']/10 for v in buckets.values()],label='HTTP'),ax.plot([k/6 for k in buckets],[v['accepted']/10 for v in buckets.values()],label='Accepted commands'),ax.legend()),'Final bucket may be partial. Includes representative reads, movement and construction; no quota changes.')
 worker=[]
 for sample in samples:
  worlds=sample.get('health',{}).get('worlds',[])
  if worlds and worlds[0].get('telemetry'): worker.append((sample,worlds[0]['telemetry']))
 if worker:
  origin=worker[0][0]['atMs'];save(D,'worker-heap-over-time','Persistent world worker: heap and capacity under natural GC','Elapsed minutes','MiB',lambda ax:(ax.plot([(a['atMs']-origin)/60000 for a,w in worker],[w['memory']['heapUsed']/1048576 for a,w in worker],label='Used heap'),ax.plot([(a['atMs']-origin)/60000 for a,w in worker],[w['memory']['heapTotal']/1048576 for a,w in worker],label='Heap capacity'),ax.legend()),'Actual persistent worker telemetry; natural GC only. Positive used-heap slope is not proof of a leak.\nAllocation/root-path probe is isolated and cannot substitute for whole-service retained-size attribution.')

A=read('/tmp/zge-bench01/original-analysis.json');L=read('/tmp/zge-bench01/original-long.json');assets=read('/tmp/zge-bench01/original-asset-audit.json');X=read('/tmp/zge-bench01/original-targeted.json');S=read('/tmp/zge-bench01/studio/timings.json');source=read('/tmp/zge-bench01/multiplayer/analysis/summary.json');source=source['rows'] if isinstance(source,dict) else source
start=A['clockAlignment']['estimatedTimedStartPageMs'];end=start+L['durationMs'];f=[x[1] for x in L['frames'] if start<=x[0]<=end]
save(B,'frame-distribution','Original game: full timed RAF distribution','Frame interval (ms; logarithmic)','Intervals',lambda ax:(ax.hist(f,bins=np.geomspace(min(f),max(f)*1.01,70),color='#247d89'),ax.set_xscale('log')),'902.836s includes later diplomacy overlay; pointer-confirmed prefix525.707s. Not uninterrupted visible play.')
save(B,'frame-spikes','Original game: maximum frame interval each second','Timed session seconds','Maximum interval (ms)',lambda ax:(ax.plot([r['second'] for r in A['frameSeriesPerSecond']],[r['maxFrameMs'] for r in A['frameSeriesPerSecond']],lw=.7),ax.axvline(525.707,color='#b75d36',label='Last successful pointer workflow'),ax.legend()),'Spikes are observations; screenshot/checkpoint instrumentation and modal changes can perturb timing.')
save(B,'startup','Original game: cold/warm startup','Run','Click to milestone (ms)',lambda ax:(ax.bar(range(6),[r['clickToUsableMs'] for r in X['startup']],label='Lifecycle running + cover removed',color=['#247d89' if r['cold'] else '#cc7832' for r in X['startup']]),ax.plot(range(6),[r['clickToGameplayReadyMs'] for r in X['startup']],'ko-',label='Actual gameplay-ready event'),ax.set_xticks(range(6),labels=['cold' if r['cold'] else 'warm' for r in X['startup']]),ax.legend()),'Three HTTP-cache-cleared and three same-profile warm navigations. OS cache uncontrolled.\nMilestone timings differ; first semantically useful pixel presentation was not instrumented.')
save(B,'memory','Original game: distinct memory observations','Elapsed minutes','MiB',lambda ax:([ax.plot([r['elapsedMs']/60000 for r in A['memorySeries']],[r[k]/1048576 for r in A['memorySeries']],label=label) for k,label in [('cdpJSHeapUsedBytes','CDP JS heap'),('performanceMemoryUsedJSHeapBytes','performance.memory'),('rendererReportedBytes','Renderer estimate')]],ax.legend()),'Different accounting domains. Renderer estimates are not resident VRAM. No forced GC during active play.')
save(B,'cpu','Original game: renderer CPU observations','Elapsed minutes','Percent of one CPU core',lambda ax:([ax.plot([r['elapsedMs']/60000 for r in A['cpuSeries']],[r[k] for r in A['cpuSeries']],label=label) for k,label in [('rendererProcessCorePercent','Renderer process time'),('mainThreadTaskBusyPercent','Main-thread TaskDuration')]],ax.legend()),'CDP active-time deltas. Not whole-host CPU utilization. GPU timing/utilization NOT_MEASURED.')
glbs=[r['duration'] for r in assets['resources'] if '.glb' in r['url']];save(B,'asset-loads','Original game: GLB resource timing','Resource fetch duration (ms)','Entries',lambda ax:ax.hist(glbs,bins=20,color='#247d89'),'Full311-entry launch/attack audit; ResourceTiming network/resource duration is not parse/animation time.\n52 distinct GLB paths; zero duplicate GLB paths in this bounded interval; historical stall cause unresolved.')
for name,key,title in [('multiplayer-throughput','acceptedCommandsPerSecond','Source world: accepted throughput'),('multiplayer-latency','latencyMs','Source world: latency tails')]:
 def draw(ax,key=key):
  for pi,profile in enumerate(['movement','construction','mixed','read','history','recovery']):
   color=plt.get_cmap('tab10')(pi)
   rows=[r for r in source if r['mode'].startswith('quota-compliant') and r['profile']==profile]
   rows=sorted(rows,key=lambda r:r['clients'])
   if not rows:continue
   if key=='latencyMs':ax.plot([r['clients'] for r in rows],[r[key]['p95'] for r in rows],'o-',color=color,label=profile+' p95');ax.plot([r['clients'] for r in rows],[r[key]['p99'] for r in rows],':',color=color,alpha=.7)
   else:ax.plot([r['clients'] for r in rows],[r[key] for r in rows],'o-',color=color,label=profile)
  ax.set_xticks([2,4,8]);ax.legend(fontsize=8,ncol=2)
 save(B,name,title,'Authorized clients','Accepted commands/s' if key!='latencyMs' else 'Latency (ms; dotted=p99)',draw,'20s paced conditions; recovery36s. Burst captures are distinct. Read/history accept no gameplay commands.\nSingle writer, unchanged240/principal/min and600/IP/min; no maximum-player inference.')
ack=[r['timing']['responseEnd'] for r in L['saves'] if r['status']==200 and A['clockAlignment']['startedEpochMs']<=r['at']<=A['clockAlignment']['startedEpochMs']+L['durationMs']];save(B,'save-latency','Original game: timed successful save response latency','Response duration (ms)','HTTP200 acknowledgments',lambda ax:ax.hist(ack,bins=25,color='#247d89'),'128 actual acknowledgments during timed window. Browser response duration excludes save debounce/backoff.')
save(B,'historical-latency','Historical source workload latency: descriptive comparison','Capture (different durations/workloads)','Milliseconds',lambda ax:([ax.bar(np.arange(3)+(i-1)*.23,[v[i] for v in [(17.75,31.84,79.96),(19.78,38.15,121.42),(19.058125,32.533667,40.50425)]],width=.23,label=label) for i,label in enumerate(['p50','p95','p99'])],ax.set_xticks(range(3),labels=['ZGE10\n900s','ZGE11\n1200s','BENCH01\n20s mixed']),ax.legend()),'NONCOMPARABLE durations/content/host contention. These values do not demonstrate a percent improvement.')
for folder in [D,B]:
 (folder/'README.md').write_text('# Real-data charts\n\nGenerated with `scripts/zge12-charts.py` from retained raw JSON/NDJSON. Exact methods, units and limitations are printed on charts. No invented GPU values, comparable-duration claim, population limit or human ratings.\n')
print(json.dumps(derived,indent=2))
