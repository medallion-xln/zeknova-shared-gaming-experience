"""Real-data charts for ZGE-13; run in a temporary environment with matplotlib, no repo dependency changes.

Usage (from a throwaway venv, not repo deps):
    env -i HOME=$HOME PATH=/opt/homebrew/bin:/usr/bin:/bin \
        /tmp/zge13-chart-venv-clean/bin/python scripts/zge13-charts.py
"""
import json, pathlib, math, statistics, os
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT = pathlib.Path.cwd()
TMP = pathlib.Path(os.environ.get('ZGE13_DATA', '/tmp/zge13'))
D = ROOT / 'docs/engine/evidence/zge13/charts'
D.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False, 'figure.dpi': 120, 'savefig.dpi': 150})

def read(p):
    return json.loads(pathlib.Path(p).read_text())

def save(name, title, xlabel, ylabel, draw, note=''):
    fig, ax = plt.subplots(figsize=(9, 4.8)); draw(ax)
    ax.set(title=title, xlabel=xlabel, ylabel=ylabel); ax.grid(alpha=.18)
    fig.subplots_adjust(bottom=.2); fig.text(.09, .035, note, fontsize=8, wrap=True)
    fig.savefig(D / (name + '.png')); plt.close(fig)

def q(a, p):
    a = sorted(a)
    return a[max(0, math.ceil(len(a) * p) - 1)] if a else float('nan')

# ---- Chart 1: continuous input latency over time ----
def c1():
    series = {}
    for fname, label in [('before-8.json', 'forced 100ms sampling (8 players)'),
                         ('after-8.json', 'bounded pacing (8 players)')]:
        d = read(TMP / 'input' / fname)
        pts = []
        for c in d.get('raw', []):
            for row in c.get('samples', []):
                if 'visibleAt' in row and 'sampleAt' in row:
                    pts.append((row['sampleAt'] / 1000, row['visibleAt'] - row['sampleAt']))
        series[label] = pts
    def draw(ax):
        for label, pts in series.items():
            color = '#c45541' if 'forced' in label else '#247d89'
            ax.scatter([p[0] for p in pts], [p[1] for p in pts], s=2, alpha=.35, color=color, label=label)
        ax.legend(fontsize=8)
    save('continuous-input-latency', 'Source world: continuous movement input-to-visible latency',
         'Elapsed session seconds', 'Input-to-visible latency (ms)', draw,
         'visibleAt - sampleAt, one of eight simultaneous players. Forced 100ms sampling is low-latency but yields 278/594 failed receipts\n'
         '(`server-backpressure` x261, collision x16, rate-limited x1). Bounded pacing emits only distinct authoritative receipts, zero 429s.')

# ---- Chart 2: latency vs player count ----
def c2():
    stats = []
    for fname, n in [('after-2.json', 2), ('after-4.json', 4), ('after-8.json', 8)]:
        d = read(TMP / 'input' / fname)
        lat = [row['visibleAt'] - row['sampleAt'] for c in d.get('raw', []) for row in c.get('samples', [])
               if 'visibleAt' in row and 'sampleAt' in row]
        stats.append({'clients': n, 'p50': q(lat, .5), 'p95': q(lat, .95), 'p99': q(lat, .99)})
    def draw(ax):
        xs = [s['clients'] for s in stats]
        for key, label, sty in [('p50', 'p50', 'o-'), ('p95', 'p95', 's-'), ('p99', 'p99', '^-')]:
            ax.plot(xs, [s[key] for s in stats], sty, label=label)
        ax.set_xticks([2, 4, 8]); ax.legend()
    save('input-latency-vs-players', 'Source world: input-to-visible latency vs player count',
         'Authorized simultaneous players', 'End-to-end input latency (ms)', draw,
         'Each distinct movement intent is a committed authoritative command; latency rises with contention on the single durable writer.\n'
         'No quota was increased. The forced-100ms case is excluded because it drops receipts rather than remaining responsive.')

# ---- Chart 3: FPS vs playable scene complexity ----
def c3():
    d = read(TMP / 'playable-performance' / 'results.json')
    def draw(ax):
        for backend, color in [('auto', '#247d89'), ('webgl', '#cc7832')]:
            rows = [r for r in d if r['mode'] == backend]
            ax.plot([r['houses'] for r in rows],
                    [1000 / statistics.mean(r['state']['frames']) for r in rows], 'o-', color=color, label=backend)
        ax.set_xticks([4, 25, 100]); ax.legend()
    save('fps-vs-playable-complexity', 'Playable Beacon Haven: frame rate by scene complexity',
         'Hierarchical multi-mesh GLB houses', 'Average frame rate (Hz)', draw,
         'Real hierarchical GLB models, colliders, active move/collect/build/goal rules; no textures. Fixed ~60Hz headless RAF is a presentation ceiling, not GPU capacity.')

# ---- Chart 4: model parse/import/acquire ----
def c4():
    d = read(TMP / 'models' / 'performance.json')
    def draw(ax):
        for i, (k, c) in enumerate([('parseMs', '#247d89'), ('importMs', '#cc7832'), ('acquireMs', '#7a5db8')]):
            v = [r[k] for r in d]
            ax.bar([i], [statistics.mean(v)], color=c, yerr=[statistics.pstdev(v)], capsize=4)
        ax.set_xticks([0, 1, 2], ['parse', 'import', 'acquire\\n(8 leases)'])
    save('model-parse-load', 'Hierarchical multi-mesh GLB: parse / import / acquire',
         'Stage (30 trials)', 'Milliseconds (mean +/- 1 stddev)', draw,
         '3-part house GLB (108 vertices, 36 triangles). Sub-ms parse, low-single-digit-ms import; not a large-model bound.')

# ---- Chart 5: heap by scene complexity ----
def c5():
    d = read(TMP / 'playable-performance' / 'results.json')
    def draw(ax):
        for backend, color in [('auto', '#247d89'), ('webgl', '#cc7832')]:
            rows = [r for r in d if r['mode'] == backend]
            ax.plot([r['houses'] for r in rows], [r['state']['heap'] / 1048576 for r in rows], 'o-', color=color, label=backend)
        ax.legend()
    save('heap-vs-playable-complexity', 'Playable world: sampled JS heap by scene complexity',
         'Hierarchical multi-mesh GLB houses', 'Used JS heap (MiB)', draw,
         'No forced GC. Positive slope is capacity growth, not a demonstrated leak. Editor 24-switch probes keep zero old-engine weak refs (see report).')

def c5b():
    # editor retention checkpoints from results.json (list of renderer runs)
    r = read(TMP / 'editor-retention' / 'results.json')
    def draw(ax):
        for run in r:
            backend = run['renderer']
            color = '#247d89' if backend == 'auto' else '#cc7832'
            cp = run['checkpoints']
            ax.plot([c['switches'] for c in cp], [c['state']['heap'] / 1048576 for c in cp], 'o-', color=color, label=backend)
        ax.legend()
    save('editor-retention-heap', 'Studio: heap across 24 project switches (empty <-> 100-entity model scene)',
         'Switch count', 'Used JS heap (MiB)', draw,
         'liveOldEngines stays 0 at every checkpoint; DOM nodes constant 654. Sustained growth ~0.3MiB over 20 switches, compilation/cache indeterminate.')

# ---- Chart 6: database latency outliers ----
def c6():
    runs = []
    for path in [TMP / 'database' / 'result.json', TMP / 'database-barrier' / 'result.json']:
        if path.exists():
            runs.append(read(path))
    def draw(ax):
        if not runs:
            return
        s = runs[0].get('summary')
        for i, k in enumerate(['openMs', 'beginMs', 'commitMs']):
            st = s[k]
            ax.bar([i], [st['p50']], color='#247d89', width=.3, label='p50' if i == 0 else None)
            ax.bar([i + .3], [st['p99']], color='#cc7832', width=.3, label='p99' if i == 0 else None)
            ax.scatter([i + .15], [st['max']], marker='x', color='#c45541', s=60, zorder=5, label='max' if i == 0 else None)
        ax.set_xticks([0.15, 1.15, 2.15], ['open', 'begin', 'commit']); ax.legend(fontsize=8)
    save('database-latency-outliers', 'Synthetic WAL/FULL SQLite timing (barrier run)',
         'Stage', 'Milliseconds (bar=p50/p99, x=max)', draw,
         'Private synthetic 4096-byte-value DB; no production database. Deliberate writer-lock wait reproduced separately (~200ms begin).\n'
         'Rare open spike (max 46ms in one run) remains unattributed to fsync/paging; no SLA.')

# ---- Chart 7: multiplayer throughput vs players ----
def c7():
    def draw(ax):
        xs, ys = [], []
        for fname, n in [('after-2.json', 2), ('after-4.json', 4), ('after-8.json', 8)]:
            d = read(TMP / 'input' / fname)
            xs.append(n); ys.append(len(d.get('network', [])))
        ax.bar([x for x in xs], ys, color='#247d89', width=.5)
        ax.set_xticks([2, 4, 8])
    save('multiplayer-throughput-vs-players', 'Source world: HTTP request volume by player count',
         'Authorized simultaneous players', 'Total HTTP requests (session)', draw,
         'Request volume rises with connected players; admission gate keeps rate-limit (429) rejections at zero in paced runs.\n'
         'Observations over differing session lengths, not a throughput SLA.')

# ---- Chart 8: operational tail latency (stage attribution) ----
def c8():
    d = read(TMP / 'operations' / 'mixed-900s.json')
    stages = d['stagesMs']
    def draw(ax):
        keys = ['admission', 'ipc', 'validation', 'databaseOpen', 'commit', 'quota']
        labels = ['admission', 'ipc', 'validation', 'db open', 'commit', 'quota']
        p99 = [stages[k]['p99'] for k in keys]
        p50 = [stages[k]['p50'] for k in keys]
        x = np.arange(len(keys))
        ax.bar(x, p99, width=.5, color='#cc7832', label='p99')
        ax.bar(x, p50, width=.5, color='#247d89', label='p50')
        ax.set_xticks(x, labels); ax.legend()
    save('operations-stage-attribution', '900s mixed soak: end-to-end stage latency attribution',
         'Server stage', 'Milliseconds', draw,
         '5792 instrumented command transactions. Admission-queue wait dominates the tail (p99 343ms), IPC second (p99 177ms);\n'
         'single writer WAL/FULL durability preserved. No quota raised.')

c1(); c2(); c3(); c4(); c5(); c5b(); c6(); c7(); c8()
(D / 'README.md').write_text('# ZGE-13 real-data charts\n\nGenerated with `scripts/zge13-charts.py` from retained `/tmp/zge13/` raw JSON. Methods, units and limitations are printed on each chart. No invented GPU values, comparable-duration claims, population limits or human ratings.\n')
print('charts written to', D)
