/** One mutation owner per domain. SHADOW can evaluate detached data only. */
export const AUTHORITY = Object.freeze({ LEGACY: 'LEGACY', SHADOW: 'SHADOW', ENGINE: 'ENGINE' });
export class Authority {
  constructor(features = {}) { this.features = new Map(Object.entries(features)); for (const [domain, mode] of this.features) this.set(domain, mode); }
  get(domain) { return this.features.get(domain) ?? AUTHORITY.LEGACY; }
  set(domain, mode) { if (!Object.values(AUTHORITY).includes(mode)) throw new TypeError(`invalid authority ${mode}`); this.features.set(domain, mode); }
  assertEngine(domain) { if (this.get(domain) !== AUTHORITY.ENGINE) throw new Error(`${domain} is not ENGINE owned`); }
  snapshot() { return Object.fromEntries(this.features); }
}
