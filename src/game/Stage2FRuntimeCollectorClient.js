/* Sentinel Grid Stage 2F-Z live-runtime collector client.
 * R0 only: observes, records, and compares. It exposes no execution surface.
 */
export function createStage2FCollectorClient(config) {
  const state = {
    sessionId: null,
    qualificationIdentityBase: null,
    provider: null,
    lastError: null,
    accepted: 0,
    rejected: 0,
    duplicate: 0,
    autoTimer: null,
    wrappedMethods: [],
    autoPollInFlight: false,
    autoCollectedStateIdentities: new Set(),
    autoSkippedSameState: 0,
    autoSkippedNotReady: 0,
    consecutiveFailures: 0,
    unavailableUntil: 0,
    suppressedUnavailablePolls: 0,
  };

  async function request(path, body = null) {
    const response = await fetch(`${config.endpoint}${path}`, {
      method: body === null ? 'GET' : 'POST',
      headers: body === null ? {} : {
        'Content-Type': 'application/json',
        'X-Sentinel-Grid-Collector-Token': config.token,
      },
      body: body === null ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
    });
    const payload = await response.json().catch(() => ({ pass: false, error: `HTTP ${response.status}` }));
    if (!response.ok || payload.pass !== true) throw new Error(payload.error ?? `Collector request failed: ${response.status}`);
    return payload.result ?? payload;
  }

  async function startSession(metadata = {}) {
    if (state.sessionId) return state.sessionId;
    const session = await request('/v1/session/start', {
      evidenceMode: config.evidenceMode,
      environmentId: metadata.environmentId ?? config.environmentId,
      label: metadata.label ?? `ZekNova live runtime ${new Date().toISOString()}`,
      playerCount: metadata.playerCount ?? null,
      gameMode: metadata.gameMode ?? null,
    });
    if (!session.qualificationIdentityBase
        || session.qualificationIdentityBase.sessionId !== session.sessionId
        || session.qualificationIdentityBase.authorityTier !== 'R0') {
      throw new Error('Collector did not return a valid Stage 2F qualification identity base');
    }
    state.sessionId = session.sessionId;
    state.qualificationIdentityBase = structuredClone(session.qualificationIdentityBase);
    globalThis.dispatchEvent?.(new CustomEvent('sentinel-grid:stage2f-session-started', { detail: structuredClone(session) }));
    return state.sessionId;
  }

  async function submitCapture(capture) {
    try {
      const sessionId = await startSession(capture?.sessionMetadata ?? {});
      const samplingIdentity = capture?.envelope?.metadata?.stateIdentity;
      if (typeof samplingIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(samplingIdentity)) {
        throw new Error('Stage 2F capture is missing its canonical sampling identity');
      }
      if (!state.qualificationIdentityBase) throw new Error('Stage 2F session identity is unavailable');
      const boundCapture = {
        ...capture,
        qualificationIdentity: {
          ...state.qualificationIdentityBase,
          samplingIdentity,
        },
      };
      const result = await request('/v1/capture', { sessionId, capture: boundCapture });
      if (result.duplicate) state.duplicate += 1;
      else state.accepted += 1;
      state.lastError = null;
      state.consecutiveFailures = 0;
      state.unavailableUntil = 0;
      globalThis.dispatchEvent?.(new CustomEvent('sentinel-grid:stage2f-capture-result', { detail: structuredClone(result) }));
      return result;
    } catch (error) {
      state.rejected += 1;
      state.lastError = error.message;
      state.consecutiveFailures += 1;
      state.unavailableUntil = Date.now() + Math.min(60_000, 2_000 * (2 ** Math.min(state.consecutiveFailures - 1, 5)));
      if (state.consecutiveFailures === 1) console.warn('[Sentinel Grid Stage2F Collector] collector unavailable; automatic capture will retry with backoff:', error.message);
      globalThis.dispatchEvent?.(new CustomEvent('sentinel-grid:stage2f-capture-error', { detail: { error: error.message } }));
      throw error;
    }
  }

  async function endSession() {
    if (!state.sessionId) return null;
    const sessionId = state.sessionId;
    const result = await request('/v1/session/end', { sessionId });
    state.sessionId = null;
    state.qualificationIdentityBase = null;
    globalThis.dispatchEvent?.(new CustomEvent('sentinel-grid:stage2f-session-ended', { detail: structuredClone(result) }));
    return result;
  }

  function registerProvider(provider) {
    if (typeof provider === 'function') state.provider = { collect: provider };
    else if (provider && typeof provider.collect === 'function') state.provider = provider;
    else throw new TypeError('Stage 2F capture provider must be a function or expose collect(context)');
    return api;
  }

  function exactCaptureFrom(value, fallbackContext = {}) {
    if (!value || typeof value !== 'object') return null;
    const candidates = [
      value.stage2fCapture,
      value.liveCapture,
      value.capture,
      value.record?.stage2fCapture,
      value.record?.liveCapture,
      value.record?.capture,
      value,
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const envelope = candidate.envelope ?? candidate.snapshotEnvelope;
      const legacyEvidence = candidate.legacyEvidence ?? candidate.stage1azEvidence;
      const context = candidate.context ?? fallbackContext;
      if (envelope && legacyEvidence && context) return { captureVersion: 1, context, envelope, legacyEvidence };
    }
    return null;
  }

  async function collectNow(context = {}) {
    const provider = state.provider ?? discoverProvider();
    if (!provider) return { collected: false, reason: 'exact-capture-provider-not-found' };
    const value = await provider.collect(context);
    const capture = exactCaptureFrom(value, context);
    if (!capture) return { collected: false, reason: 'provider-did-not-return-exact-stage2f-capture' };
    return { collected: true, result: await submitCapture(capture) };
  }

  function discoverProvider() {
    const objects = [
      globalThis.ZekNovaStage2FCaptureProvider,
      globalThis.ZekNovaPrimeShadowIntegration,
      globalThis.ZekNovaPrimeShadowAdapter,
      globalThis.ZekNovaLiveParityIntegration,
      globalThis.ZekNovaLiveShadowIntegration,
    ].filter(Boolean);
    const methods = ['buildStage2FCapture', 'captureStage2F', 'exportStage2FCapture', 'getStage2FCapture'];
    for (const object of objects) {
      for (const method of methods) {
        if (typeof object?.[method] === 'function') {
          state.provider = { collect: (context) => object[method](context) };
          return state.provider;
        }
      }
    }
    return null;
  }

  function tryWrapReadOnlyMethod(objectName, methodName) {
    const object = globalThis[objectName];
    if (!object || typeof object[methodName] !== 'function') return false;
    const descriptor = Object.getOwnPropertyDescriptor(object, methodName);
    if (descriptor && descriptor.writable === false && !descriptor.set) return false;
    if (object[methodName].__sentinelGridStage2FWrapped) return true;
    const original = object[methodName];
    const wrapped = function stage2fObservedMethod(...args) {
      const result = original.apply(this, args);
      Promise.resolve(result).then((resolved) => {
        const fallback = args.find((entry) => entry?.context)?.context ?? args.find((entry) => entry?.factionId) ?? {};
        const capture = exactCaptureFrom(resolved, fallback);
        if (capture) submitCapture(capture).catch(() => {});
      }).catch(() => {});
      return result;
    };
    Object.defineProperty(wrapped, '__sentinelGridStage2FWrapped', { value: true });
    try {
      object[methodName] = wrapped;
      state.wrappedMethods.push(`${objectName}.${methodName}`);
      return true;
    } catch { return false; }
  }

  function bindKnownReadOnlySurfaces() {
    for (const objectName of ['ZekNovaPrimeShadowIntegration', 'ZekNovaPrimeShadowAdapter', 'ZekNovaLiveShadowIntegration']) {
      for (const methodName of ['observe', 'capture', 'recommend', 'evaluate']) tryWrapReadOnlyMethod(objectName, methodName);
    }
    discoverProvider();
    return diagnose();
  }

  async function pollOnce() {
    if (state.autoPollInFlight) return { collected: false, reason: 'automatic-poll-already-in-flight' };
    if (Date.now() < state.unavailableUntil) {
      state.suppressedUnavailablePolls += 1;
      return { collected: false, reason: 'collector-unavailable-backoff', retryAt: state.unavailableUntil };
    }
    state.autoPollInFlight = true;
    try {
      const provider = state.provider ?? discoverProvider();
      if (!provider || typeof provider.diagnose !== 'function') {
        state.autoSkippedNotReady += 1;
        return { collected: false, reason: 'side-effect-free-provider-diagnose-not-found' };
      }
      const diagnosis = await provider.diagnose({ reason: 'interval-diagnostic', samplingMode: 'diagnostic' });
      const stateIdentity = diagnosis?.sampling?.stateIdentity;
      if (diagnosis?.ready !== true || typeof stateIdentity !== 'string' || !stateIdentity) {
        state.autoSkippedNotReady += 1;
        return { collected: false, reason: 'provider-not-ready', diagnosis };
      }
      if (state.autoCollectedStateIdentities.has(stateIdentity)) {
        state.autoSkippedSameState += 1;
        return { collected: false, reason: 'state-already-automatically-sampled', stateIdentity };
      }
      const result = await collectNow({
        reason: 'interval',
        samplingMode: 'auto',
        expectedStateIdentity: stateIdentity,
      });
      if (result.collected) state.autoCollectedStateIdentities.add(stateIdentity);
      return { ...result, stateIdentity };
    } finally {
      state.autoPollInFlight = false;
    }
  }

  function startAutoCollection(intervalMs = config.sampleIntervalMs ?? 5000) {
    if (state.autoTimer) return;
    state.autoTimer = setInterval(() => pollOnce().catch(() => {}), Math.max(1000, intervalMs));
  }

  function stopAutoCollection() {
    if (state.autoTimer) clearInterval(state.autoTimer);
    state.autoTimer = null;
  }

  function diagnose() {
    return Object.freeze({
      clientVersion: '0.10.0',
      endpoint: config.endpoint,
      sessionId: state.sessionId,
      stage2fCampaignId: state.qualificationIdentityBase?.stage2fCampaignId ?? null,
      sentinelRuntimeId: state.qualificationIdentityBase?.sentinelRuntimeId ?? null,
      evidenceMode: state.qualificationIdentityBase?.evidenceMode ?? config.evidenceMode ?? null,
      providerBound: Boolean(state.provider),
      wrappedMethods: [...state.wrappedMethods],
      accepted: state.accepted,
      rejected: state.rejected,
      duplicate: state.duplicate,
      lastError: state.lastError,
      autoPollInFlight: state.autoPollInFlight,
      autoUniqueStateCount: state.autoCollectedStateIdentities.size,
      autoSkippedSameState: state.autoSkippedSameState,
      autoSkippedNotReady: state.autoSkippedNotReady,
      consecutiveFailures: state.consecutiveFailures,
      unavailableUntil: state.unavailableUntil,
      suppressedUnavailablePolls: state.suppressedUnavailablePolls,
      authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
      knownGlobals: [
        'ZekNovaStage2FCaptureProvider',
        'ZekNovaPrimeShadowIntegration',
        'ZekNovaPrimeShadowAdapter',
        'ZekNovaLiveParityIntegration',
        'ZekNovaLiveShadowIntegration',
      ].filter((name) => Boolean(globalThis[name])),
    });
  }

  const api = Object.freeze({
    startSession,
    submitCapture,
    endSession,
    registerProvider,
    collectNow,
    bindKnownReadOnlySurfaces,
    pollOnce,
    startAutoCollection,
    stopAutoCollection,
    diagnose,
    authority: Object.freeze({ tier: 'R0', canDispatch: false, canMutateLiveWorld: false }),
  });

  globalThis.addEventListener?.('zeknova:stage2f-capture', (event) => {
    const capture = exactCaptureFrom(event.detail);
    if (capture) submitCapture(capture).catch(() => {});
  });
  globalThis.addEventListener?.('pagehide', () => { endSession().catch(() => {}); });
  return api;
}
