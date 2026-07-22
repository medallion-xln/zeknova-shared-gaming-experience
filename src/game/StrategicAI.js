const STRATEGY_QUESTION = /strategic scan|alpha\s*zero|alpha\s*go|agent\s*zero|agentero|\bazl\b|mcts|monte carlo|what should|what next|recommend|priorit|\bplan\b|\bstrategy\b/i;

export class StrategicAI {
  constructor({ simulations = 320, depth = 7, timeBudgetMs = 55 } = {}) {
    this.options = { simulations, depth, timeBudgetMs, minimumSimulations: 96 };
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.game = null;
    this.originalAdvisor = null;
  }

  async install({ game = globalThis.ZekNovaGame } = {}) {
    if (!game) throw new Error('The live ZekNova game is not available to AZL.');
    await import('../../azl/zeknova-adapter.js?v=azl4');
    await import('../../azl/azl-engine.js?v=azl4');
    if (!globalThis.AZL_ADAPTER || !globalThis.AZL?.StrategicEngine) throw new Error('AZL adapter or engine failed to load.');
    this.game = game;
    this.originalAdvisor = game.askAdvisor.bind(game);
    game.askAdvisor = (question) => this.advise(question);
    globalThis.ZekNovaStrategicAI = this;
    document.documentElement.dataset.zeknovaStrategicAi = 'moe-puct';
    this.updateInterface();
    return this;
  }

  updateInterface() {
    const button = document.getElementById('strategy-scan');
    const detail = button?.querySelector('small');
    if (detail) detail.textContent = '320 PUCT SIMS · 6 EXPERTS · WORKER';
    button?.setAttribute('title', 'Search live colony futures with the AZL mixture-of-experts policy and PUCT.');
  }

  async advise(question) {
    if (!STRATEGY_QUESTION.test(String(question || ''))) return this.originalAdvisor(question);
    try {
      const state = globalThis.AZL_ADAPTER.captureSearchState();
      const result = await this.search(state);
      const answer = globalThis.AZL.StrategicEngine.formatResult(result, state);
      globalThis.dispatchEvent(new CustomEvent('zeknova:strategic-search-complete', { detail: result }));
      return { answer, provider: 'azl-moe', model: `PUCT ${result.simulations} · D${result.depth}` };
    } catch (error) {
      console.warn('AZL strategic search fell back to the existing planner.', error);
      return this.originalAdvisor(question);
    }
  }

  search(state) {
    if (typeof Worker === 'undefined') return Promise.resolve(this.searchOnMainThread(state));
    if (!this.worker) this.createWorker();
    if (!this.worker) return Promise.resolve(this.searchOnMainThread(state));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pending.delete(id);
        try { resolve(this.searchOnMainThread(state)); }
        catch (error) { reject(error); }
      }, 2500);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type: 'search', state, options: this.options });
    });
  }

  createWorker() {
    try {
      this.worker = new Worker(new URL('../../azl/azl-worker.js?v=azl4', import.meta.url));
      this.worker.onmessage = ({ data }) => {
        const entry = this.pending.get(data?.id);
        if (!entry) return;
        this.pending.delete(data.id);
        clearTimeout(entry.timer);
        if (data?.ok === false || data?.type === 'search-error' || data?.error) {
          const message = typeof data?.error === 'object'
            ? data.error.message
            : data?.error;
          entry.reject(new Error(message || 'AZL worker search failed.'));
        } else {
          entry.resolve(data.result);
        }
      };
      this.worker.onerror = (event) => {
        console.warn('AZL worker stopped; future searches will use the main-thread fallback.', event.message);
        this.worker?.terminate();
        this.worker = null;
      };
    } catch (error) {
      console.warn('AZL worker could not start.', error);
      this.worker = null;
    }
    return this.worker;
  }

  searchOnMainThread(state) {
    return globalThis.AZL.StrategicEngine.search(globalThis.AZL_ADAPTER, state, {
      ...this.options,
      simulations: Math.min(160, this.options.simulations),
      minimumSimulations: 64,
      timeBudgetMs: Math.min(28, this.options.timeBudgetMs),
    });
  }

  dispose() {
    if (this.game && this.originalAdvisor) this.game.askAdvisor = this.originalAdvisor;
    this.worker?.terminate();
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('AZL strategic search was disposed.'));
    }
    this.pending.clear();
    this.worker = null;
    this.game = null;
    if (globalThis.ZekNovaStrategicAI === this) globalThis.ZekNovaStrategicAI = null;
  }
}
