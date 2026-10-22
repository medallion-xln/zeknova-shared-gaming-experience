/** WorkerPool-compatible replacement: bounded settlement includes queued tasks.
 * Failure resets a generation because transferred buffers cannot be reused safely.
 * Retry must reload original bytes at the asset boundary, never the detached buffer.
 */
export class BoundedWorkerPool {
  constructor({ limit = 4, timeoutMs = 15000 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 16 || !(timeoutMs > 0)) throw new RangeError('invalid worker pool limits');
    this.pool = limit; this.timeoutMs = timeoutMs; this.workers = []; this.queue = []; this.active = new Set(); this.workerCreator = null; this.disposed = false;
    this.metrics = { completed: 0, failures: 0, resets: 0, created: 0 };
  }
  setWorkerLimit(limit) { if (!Number.isInteger(limit) || limit < 1 || limit > 16 || this.active.size || this.workers.length) throw new Error('worker limit must be set before use (1..16)'); this.pool = limit; }
  setWorkerCreator(creator) { this.workerCreator = creator; }
  postMessage(message, transfer = []) {
    if (this.disposed) return Promise.reject(new Error('worker pool disposed'));
    return new Promise((resolve,reject) => {
      const task = { message, transfer, resolve, reject, timer: null };
      task.timer = setTimeout(() => this._reset(new Error('transcode timeout')), this.timeoutMs);
      this.active.add(task); this.queue.push(task); this._pump();
    });
  }
  _spawn() {
    const worker = this.workerCreator(); const terminate = worker.terminate.bind(worker);
    const slot = { worker, task: null, terminate, handlers: {} };
    const fail = e => this._reset(new Error(`transcode worker failed: ${e?.message ?? e?.type ?? 'terminated'}`));
    slot.handlers = { error: fail, messageerror: fail, message: e => {
      const task = slot.task; if (!task) return;
      slot.task = null; clearTimeout(task.timer); this.active.delete(task); this.metrics.completed++; task.resolve(e); this._pump();
    } };
    for (const [type,fn] of Object.entries(slot.handlers)) worker.addEventListener(type,fn);
    worker.terminate = () => { terminate(); fail({ type: 'terminated' }); };
    this.workers.push(slot); this.metrics.created++; return slot;
  }
  _pump() {
    try {
      while (this.queue.length) {
        let slot = this.workers.find(s => !s.task);
        if (!slot && this.workers.length < this.pool) slot = this._spawn();
        if (!slot) return;
        slot.task = this.queue.shift(); slot.worker.postMessage(slot.task.message, slot.task.transfer);
      }
    } catch (error) { this._reset(error); }
  }
  _reset(error) {
    this.metrics.resets++; this.metrics.failures += this.active.size;
    for (const task of this.active) { clearTimeout(task.timer); task.reject(error); }
    this.active.clear(); this.queue.length = 0;
    for (const slot of this.workers.splice(0)) { for (const [type,fn] of Object.entries(slot.handlers)) slot.worker.removeEventListener(type,fn); slot.worker.terminate = slot.terminate; slot.terminate(); }
  }
  dispose() { if (this.disposed) return; this.disposed = true; this._reset(new Error('worker pool disposed')); }
  status() { return { ...this.metrics, live: this.workers.length, pending: this.active.size, limit: this.pool }; }
}
