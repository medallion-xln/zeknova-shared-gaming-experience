/*
 * Sentinel Grid Stage 2F-Z Collector Hardening Provider Bridge v5
 *
 * Explicitly maps the live W0-P parity bundle into the certified Stage 2E-Z
 * ZekNova snapshot envelope. The collector derives the frozen Stage 1A-Z
 * compatibility evidence with the certified kernel implementation. Mission context
 * is bound to the same first-incomplete-mission and completed-objective-count
 * logic used by the live HUD.
 *
 * R0 only. No executor, dispatch, command, resource-spend, or live mutation.
 */
(function installStage2FCollectorHardeningBridgeV5(global) {
  'use strict';

  const BRIDGE_ID = 'sentinel-grid-stage2f-collector-hardening-bridge-v5';
  const PROVIDER_VERSION = '5.0.0';
  const LEGACY_DERIVATION_ID = 'sentinel-grid-stage2f-certified-legacy-v1';
  const ACTIONS = Object.freeze([
    'stabilize',
    'scout_region',
    'intercept_contact',
    'fortify_known_route',
    'repair_known_structure',
    'share_intelligence',
  ]);
  const ACTION_KINDS = Object.freeze([
    'settlement', 'region', 'contact', 'route', 'structure', 'faction',
  ]);
  const REQUIRED_CONTEXT = Object.freeze([
    'factionId', 'biomeId', 'missionId', 'missionPhase',
    'tensionBand', 'infrastructureBand', 'tick',
  ]);
  const authority = Object.freeze({ tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
  const HEAVY_KEYS = new Set([
    'scene', 'renderer', 'camera', 'canvas', 'geometry', 'material', 'texture',
    'domElement', 'document', 'window', 'globalThis', 'parent', 'top', 'frames',
    'enemies', 'projectiles', 'particles', 'meshes', 'children',
  ]);

  let lastWarningSignature = null;
  const stateEvaluationCounts = new Map();
  const automaticEvaluationCounts = new Map();

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function clone(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }
  function clamp(value, minimum = -1, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, value));
  }
  function normalizedMetric(value, fallback) {
    if (!Number.isFinite(Number(value))) return fallback;
    const number = Number(value);
    const normalized = Math.abs(number) > 1 ? number / 100 : number;
    return Number(clamp(normalized).toFixed(6));
  }
  function band(value, labels) {
    if (!Number.isFinite(Number(value))) return null;
    const number = Math.abs(Number(value)) <= 1 ? Number(value) * 100 : Number(value);
    if (number <= 33) return labels[0];
    if (number <= 66) return labels[1];
    return labels[2];
  }
  function safeOwn(value, key) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
    } catch {
      return undefined;
    }
  }
  function safeEntries(value) {
    if (!value || typeof value !== 'object') return [];
    try {
      return Object.entries(Object.getOwnPropertyDescriptors(value))
        .filter(([key, descriptor]) => !HEAVY_KEYS.has(key) && Object.prototype.hasOwnProperty.call(descriptor, 'value'))
        .map(([key, descriptor]) => [key, descriptor.value]);
    } catch {
      return [];
    }
  }
  function findNamedScalar(roots, names, predicate, maxDepth = 5, maxNodes = 2500) {
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    const queue = roots.filter((root) => root && root.value != null)
      .map((root) => ({ value: root.value, path: root.path, depth: 0 }));
    const seen = new WeakSet();
    let visited = 0;
    while (queue.length && visited < maxNodes) {
      const current = queue.shift();
      visited += 1;
      const { value, path, depth } = current;
      if (value && typeof value === 'object' && !seen.has(value)) seen.add(value);
      if (depth >= maxDepth || !value || typeof value !== 'object') continue;
      for (const [key, child] of safeEntries(value)) {
        const childPath = `${path}.${key}`;
        if (wanted.has(key.toLowerCase()) && predicate(child)) return { value: child, path: childPath };
        if (child && typeof child === 'object' && !seen.has(child)) {
          queue.push({ value: child, path: childPath, depth: depth + 1 });
        }
      }
    }
    return null;
  }
  function normalizeBiome(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim().toLowerCase();
    if (text === 'wetland' || text === 'wetlands' || text.includes('wetland')) return 'wetlands';
    for (const biome of ['forest', 'desert', 'highlands', 'arctic']) {
      if (text === biome || text.includes(biome)) return biome;
    }
    return null;
  }
  function normalizeMissionId(value, key = '') {
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim();
      const direct = text.match(/mission[-_ ]?(\d{1,2})/i);
      if (direct) return `mission-${String(Number(direct[1])).padStart(2, '0')}`;
      return text.slice(0, 128);
    }
    if (!Number.isInteger(value)) return null;
    let mission = value;
    if (/index/i.test(key)) mission += 1;
    if (mission < 1 || mission > 12) return null;
    return `mission-${String(mission).padStart(2, '0')}`;
  }
  function normalizeMissionPhase(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim().toLowerCase();
    if (/opening|early|start|phase[-_ ]?1/.test(text)) return 'opening';
    if (/midgame|middle|phase[-_ ]?2/.test(text)) return 'midgame';
    if (/late|boss|final|phase[-_ ]?3/.test(text)) return 'late';
    return text.slice(0, 128);
  }


  const EPHEMERAL_STATE_KEYS = new Set([
    'tick', 'quantum', 'epoch', 'frame', 'frameId', 'timestamp', 'capturedAt',
    'createdAt', 'updatedAt', 'observationId', 'legalityId', 'targetViewId',
    'candidateSetId', 'planningStateId', 'stateId', 'reportId', 'parityReport',
  ]);

  function canonicalIdentityValue(value, seen = new WeakSet()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('State identity cannot include non-finite numbers');
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === 'bigint') return { __bigint__: value.toString() };
    if (Array.isArray(value)) return value.map((entry) => canonicalIdentityValue(entry, seen));
    if (typeof value !== 'object') return null;
    if (seen.has(value)) throw new Error('State identity input contains a cycle');
    seen.add(value);
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (EPHEMERAL_STATE_KEYS.has(key)
          || /(?:^|_)(?:time|timestamp|tick|quantum|epoch|frame)(?:$|_)/i.test(key)
          || /(?:Time|Timestamp|Tick|Quantum|Epoch|Frame|At)$/.test(key)) continue;
      const child = value[key];
      if (typeof child === 'undefined' || typeof child === 'function' || typeof child === 'symbol') continue;
      output[key] = canonicalIdentityValue(child, seen);
    }
    seen.delete(value);
    return output;
  }

  function stableIdentityString(value) {
    return JSON.stringify(canonicalIdentityValue(value));
  }

  async function sha256Hex(text) {
    const subtle = global.crypto?.subtle;
    if (!subtle || typeof subtle.digest !== 'function' || typeof TextEncoder !== 'function') {
      throw new Error('Web Crypto SHA-256 is required for Stage 2F state identity');
    }
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function normalizedObservationVector(observation) {
    if (!observation || !Array.isArray(observation.featureVector) || observation.featureVector.length !== 592) {
      throw new Error('Live faction observation must contain exactly 592 features');
    }
    return observation.featureVector.map((entry) => {
      const number = Number(entry);
      if (!Number.isFinite(number)) throw new Error('Live faction observation contains a non-finite feature');
      return Number(clamp(number).toFixed(6));
    });
  }

  async function deriveStateIdentity(parityBundle, context, campaign) {
    const observation = parityBundle.observation;
    const document = {
      stateIdentityVersion: 1,
      gameId: 'zeknova',
      adapterId: 'zeknova-stage1az-shadow-adapter',
      factionId: context.factionId,
      worldId: typeof observation?.worldId === 'string' ? observation.worldId : null,
      observation: normalizedObservationVector(observation),
      planningState: canonicalIdentityValue(parityBundle.planningState || {}),
      candidateSet: canonicalIdentityValue(parityBundle.candidateSet || {}),
      missionContext: canonicalIdentityValue(global.ZekNovaGame?.ui?.lastState?.missionContext || {}),
      campaign: canonicalIdentityValue(campaign || {}),
      context: {
        biomeId: context.biomeId,
        missionId: context.missionId,
        missionPhase: context.missionPhase,
        tensionBand: context.tensionBand,
        infrastructureBand: context.infrastructureBand,
      },
      identityExcludes: ['tick', 'quantum', 'epoch', 'timestamps', 'derived packet ids'],
    };
    const hash = await sha256Hex(stableIdentityString(document));
    return { hash, document };
  }

  function exactMissionSurface() {
    const game = global.ZekNovaGame;
    const missionModule = global.ZekNovaSource?.Missions;
    const missionContext = game?.ui?.lastState?.missionContext;

    if (!missionModule || typeof missionModule.createCampaignTiers !== 'function') {
      return {
        resolved: false,
        failure: 'ZekNovaSource.Missions.createCampaignTiers is unavailable',
        missionContext: null,
        missionContextPath: null,
      };
    }
    if (typeof missionModule.objectiveComplete !== 'function') {
      return {
        resolved: false,
        failure: 'ZekNovaSource.Missions.objectiveComplete is unavailable',
        missionContext: null,
        missionContextPath: null,
      };
    }
    if (!isObject(missionContext)) {
      return {
        resolved: false,
        failure: 'ZekNovaGame.ui.lastState.missionContext is unavailable',
        missionContext: null,
        missionContextPath: null,
      };
    }

    const tiers = missionModule.createCampaignTiers();
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return {
        resolved: false,
        failure: 'createCampaignTiers returned no campaign tiers',
        missionContext,
        missionContextPath: 'ZekNovaGame.ui.lastState.missionContext',
      };
    }

    const sequence = [];
    for (const tier of tiers) {
      if (!Array.isArray(tier?.missions)) continue;
      for (const mission of tier.missions) {
        const objectives = Array.isArray(mission?.subObjectives)
          ? mission.subObjectives
          : missionModule.MISSION_OBJECTIVES?.[mission?.id];
        if (!mission || typeof mission.id !== 'string' || !Array.isArray(objectives) || objectives.length === 0) {
          throw new Error('Campaign mission is missing an id or objective definitions');
        }
        sequence.push({
          ...mission,
          subObjectives: objectives,
          tierNumber: Number(tier.number),
          tierTitle: String(tier.title || ''),
        });
      }
    }
    if (sequence.length !== 12) {
      throw new Error(`Certified campaign must expose exactly 12 missions; received ${sequence.length}`);
    }

    const evaluations = sequence.map((mission) => {
      const completed = mission.subObjectives.map((objective) => {
        const result = missionModule.objectiveComplete(objective, missionContext);
        if (typeof result !== 'boolean') throw new Error('objectiveComplete must return a boolean');
        return result;
      });
      return {
        mission,
        completed,
        complete: completed.every(Boolean),
        completedObjectiveCount: completed.filter(Boolean).length,
        incompleteObjectiveIndexes: completed
          .map((value, index) => (value ? null : index))
          .filter((value) => value !== null),
      };
    });

    const currentIndex = evaluations.findIndex((entry) => !entry.complete);
    if (currentIndex < 0) {
      return {
        resolved: true,
        campaignComplete: true,
        current: null,
        currentIndex: -1,
        completedMissionCount: sequence.length,
        totalMissionCount: sequence.length,
        missionContext,
        missionContextPath: 'ZekNovaGame.ui.lastState.missionContext',
        catalogPath: 'ZekNovaSource.Missions.createCampaignTiers()',
      };
    }

    const current = evaluations[currentIndex];
    const objectiveCount = current.completed.length;
    if (objectiveCount !== 5) {
      throw new Error(`Certified ZekNova mission ${current.mission.id} must expose exactly five objectives`);
    }

    const completedObjectiveCount = current.completedObjectiveCount;
    const missionPhase = completedObjectiveCount <= 1
      ? 'opening'
      : completedObjectiveCount <= 3
        ? 'midgame'
        : 'late';

    return {
      resolved: true,
      campaignComplete: false,
      current: current.mission,
      currentIndex,
      completedMissionCount: currentIndex,
      totalMissionCount: sequence.length,
      objectiveCount,
      completedObjectiveCount,
      incompleteObjectiveIndexes: current.incompleteObjectiveIndexes,
      missionPhase,
      missionContext,
      missionContextPath: 'ZekNovaGame.ui.lastState.missionContext',
      catalogPath: 'ZekNovaSource.Missions.createCampaignTiers()',
      phaseDerivation: 'completed-objective-count/5:0-1=opening,2-3=midgame,4=late',
    };
  }

  function resolveContext({ overrides, parityBundle }) {
    const observation = parityBundle.observation;
    const metrics = parityBundle.planningState?.metrics || {};
    const campaign = exactMissionSurface();
    const paths = {};

    let missionId = null;
    let missionPhase = null;
    let biomeId = null;

    if (campaign.resolved && !campaign.campaignComplete && campaign.current) {
      missionId = campaign.current.id;
      missionPhase = campaign.missionPhase;
      biomeId = normalizeBiome(campaign.current.biome);
      paths.missionId = `${campaign.catalogPath}[${campaign.currentIndex}].id`;
      paths.missionPhase = campaign.phaseDerivation;
      paths.biomeId = `${campaign.catalogPath}[${campaign.currentIndex}].biome`;
      paths.missionContext = campaign.missionContextPath;
    }

    if (!biomeId) {
      const aoBiome = normalizeBiome(global.ZekNovaGame?.currentAO?.id);
      const userBiome = normalizeBiome(global.ZekNovaGame?.user?.biome);
      biomeId = aoBiome || userBiome;
      if (aoBiome) paths.biomeId = 'ZekNovaGame.currentAO.id';
      else if (userBiome) paths.biomeId = 'ZekNovaGame.user.biome';
    }

    const tensionBand = band(metrics.tension, ['low', 'medium', 'high']);
    const infrastructureBand = band(metrics.infrastructureReliability, ['fragile', 'developing', 'established']);

    return {
      context: {
        factionId: overrides.factionId || observation.factionId || null,
        biomeId,
        missionId,
        missionPhase,
        tensionBand,
        infrastructureBand,
        tick: observation.quantum,
      },
      paths,
      campaign: {
        resolved: campaign.resolved,
        failure: campaign.failure || null,
        campaignComplete: campaign.campaignComplete === true,
        currentMissionIndex: Number.isInteger(campaign.currentIndex) ? campaign.currentIndex : null,
        completedMissionCount: Number.isInteger(campaign.completedMissionCount) ? campaign.completedMissionCount : null,
        totalMissionCount: Number.isInteger(campaign.totalMissionCount) ? campaign.totalMissionCount : null,
        completedObjectiveCount: Number.isInteger(campaign.completedObjectiveCount) ? campaign.completedObjectiveCount : null,
        objectiveCount: Number.isInteger(campaign.objectiveCount) ? campaign.objectiveCount : null,
        incompleteObjectiveIndexes: Array.isArray(campaign.incompleteObjectiveIndexes)
          ? [...campaign.incompleteObjectiveIndexes]
          : [],
        phaseDerivation: campaign.phaseDerivation || null,
      },
    };
  }

  function targetKind(actionIndex, target) {
    if (actionIndex === 0) return ACTION_KINDS[actionIndex];
    const topic = String(target?.topic || '').toLowerCase();
    if (topic.includes('route')) return actionIndex === 1 ? 'region' : 'route';
    if (topic.includes('unit') || topic.includes('contact')) return 'contact';
    if (topic.includes('structure') || topic.includes('infrastructure')) return 'structure';
    return ACTION_KINDS[actionIndex];
  }

  function buildTargetSlots(parityBundle) {
    const observation = parityBundle.observation;
    const targetView = parityBundle.targetView || parityBundle.legality?.targetView;
    if (!targetView || !Array.isArray(targetView.actions) || targetView.actions.length !== 6) {
      throw new Error('Live Prime targetView must contain exactly six canonical actions');
    }
    const slots = {};
    for (let index = 0; index < ACTIONS.length; index += 1) {
      const actionName = ACTIONS[index];
      const actionView = targetView.actions[index];
      if (!actionView || actionView.actionIndex !== index || actionView.actionKey !== actionName) {
        throw new Error(`Target view action ${index} does not match ${actionName}`);
      }
      const target = Array.isArray(actionView.targets) && actionView.targets.length > 0
        ? actionView.targets[0]
        : null;
      slots[actionName] = {
        slot: index,
        id: String(target?.targetId || `${observation.observationId}:${actionName}:no-target`).slice(0, 256),
        kind: targetKind(index, target),
        known: index === 0 || Boolean(target),
      };
    }
    return slots;
  }

  function buildMetrics(planningState) {
    const metrics = planningState?.metrics || {};
    return {
      stability: Number(((normalizedMetric(metrics.settlementSecurity, 0.5) + normalizedMetric(metrics.structureSupport, 0.5)) / 2).toFixed(6)),
      threat: normalizedMetric(metrics.hostilePressure, 0.5),
      infrastructure: normalizedMetric(metrics.infrastructureReliability, 0.5),
      intelligence: normalizedMetric(metrics.informationReach, 0.5),
      resources: normalizedMetric(metrics.resourceSecurity, 0.5),
      routeIntegrity: normalizedMetric(metrics.routeSecurity, 0.5),
    };
  }

  function buildKnownEntityIds(parityBundle) {
    const ids = [];
    const targetView = parityBundle.targetView;
    for (const action of targetView?.actions || []) {
      for (const target of action.targets || []) {
        for (const value of [target.targetId, target.subjectId, target.recordId]) {
          if (typeof value === 'string' && value.length > 0) ids.push(value.slice(0, 256));
        }
      }
    }
    return [...new Set(ids)].sort().slice(0, 4096);
  }

  function buildEnvelope(parityBundle, factionId) {
    const observation = parityBundle.observation;
    const legality = parityBundle.legality;
    if (!observation || !Array.isArray(observation.featureVector) || observation.featureVector.length !== 592) {
      throw new Error('Live faction observation must contain exactly 592 features');
    }
    if (!legality || !Array.isArray(legality.finalMask) || legality.finalMask.length !== 6) {
      throw new Error('Live legality record must contain exactly six final mask entries');
    }
    const tick = observation.quantum;
    if (!Number.isInteger(tick) || tick < 0 || tick >= 2048) {
      throw new Error('Live observation quantum must be an integer in the certified range 0..2047');
    }
    const legalMask = legality.finalMask.map((entry) => entry === 1 || entry === true);
    if (!legalMask.some(Boolean) || legality.terminal === true) {
      throw new Error('Terminal or empty-mask states are not eligible for Stage 2F shadow capture');
    }
    const targetSlots = buildTargetSlots(parityBundle);
    for (let index = 1; index < 6; index += 1) {
      if (legalMask[index] && targetSlots[ACTIONS[index]].known !== true) {
        throw new Error(`Legal targeted action ${ACTIONS[index]} has no canonical target`);
      }
    }
    const payload = {
      stateVersion: 1,
      tick,
      maxTick: 2048,
      activeFactionId: factionId,
      terminal: false,
      factions: {
        [factionId]: {
          observation: observation.featureVector.map((entry) => Number(clamp(Number(entry)).toFixed(6))),
          legalMask,
          targetSlots,
          metrics: buildMetrics(parityBundle.planningState),
          knowledge: {
            epoch: tick,
            knownEntityIds: buildKnownEntityIds(parityBundle),
          },
        },
      },
    };
    const snapshotSuffix = String(observation.observationId || `${factionId}-${tick}`)
      .replace(/[^a-zA-Z0-9._:-]/g, '-')
      .slice(-120);
    return {
      snapshotContractVersion: 1,
      gameId: 'zeknova',
      adapterId: 'zeknova-stage1az-shadow-adapter',
      adapterVersion: '1.0.0',
      snapshotId: `zeknova-live-${tick}-${snapshotSuffix}`.slice(0, 256),
      formatId: 'zeknova/stage1az-faction-state-json',
      formatVersion: 1,
      observers: [factionId],
      payload,
      metadata: {
        sourceLineage: 'Stage 1A-Z live W0-P parity',
        observationId: observation.observationId,
        legalityId: legality.legalityId,
        targetViewId: parityBundle.targetView?.targetViewId || legality.targetViewId,
        bridgeId: BRIDGE_ID,
        authority: 'R0',
      },
    };
  }

  async function captureParitySurface(overrides, parity) {
    const input = isObject(overrides) ? overrides : {};
    const local = await parity.captureLocalParity();
    const factionId = input.factionId || local?.observation?.factionId;
    if (typeof factionId !== 'string' || !factionId) throw new Error('Live parity did not expose a factionId');
    const parityBundle = factionId === local?.observation?.factionId
      ? local
      : await parity.captureForFaction(factionId);
    if (!parityBundle || !parityBundle.observation) throw new Error('Live parity did not expose an observation');
    return { input, factionId, parityBundle };
  }

  async function inspectState(overrides, parity) {
    const { input, factionId, parityBundle } = await captureParitySurface(overrides, parity);
    normalizedObservationVector(parityBundle.observation);
    const resolved = resolveContext({ overrides: input, parityBundle });
    const context = { ...resolved.context, factionId, tick: parityBundle.observation.quantum };
    const missing = [];
    for (const field of REQUIRED_CONTEXT) {
      const value = context[field];
      if (field === 'tick') {
        if (!Number.isInteger(value) || value < 0) missing.push(`context.${field}`);
      } else if (typeof value !== 'string' || value.length === 0) {
        missing.push(`context.${field}`);
      }
    }
    const identity = await deriveStateIdentity(parityBundle, context, resolved.campaign);
    const stateKey = `${factionId}:sgstate:v1:${identity.hash}`;
    const evaluationOrdinal = stateEvaluationCounts.get(stateKey) || 0;
    const automaticEvaluationOrdinal = automaticEvaluationCounts.get(stateKey) || 0;
    const exhausted = evaluationOrdinal >= 4;
    return {
      ready: missing.length === 0 && !exhausted,
      input,
      factionId,
      parityBundle,
      context,
      resolved,
      missing,
      stateIdentity: identity.hash,
      stateKey,
      evaluationOrdinal,
      automaticEvaluationOrdinal,
      exhausted,
      diagnostics: {
        bridgeId: BRIDGE_ID,
        mappingMode: 'explicit-live-parity-to-certified-envelope',
        diagnosticMode: 'parity-inspection-only-no-prime-evaluation',
        stateIdentityMode: 'sha256-meaningful-state-v1-tick-independent',
        contextPaths: resolved.paths,
        campaignResolution: resolved.campaign,
        observationId: parityBundle.observation.observationId || null,
        featureCount: parityBundle.observation.featureVector.length,
        stateIdentity: identity.hash,
        stateKey,
        evaluationOrdinal,
        automaticEvaluationOrdinal,
        evaluationCapPerState: 4,
        automaticEvaluationCapPerState: 1,
        tickExcludedFromStateIdentity: true,
        primeEvaluationPerformed: false,
        authority,
      },
    };
  }

  function finalizeEnvelopeIdentity(envelope, stateIdentity) {
    envelope.snapshotId = `zeknova-live-state-${stateIdentity.slice(0, 48)}`;
    envelope.metadata = {
      ...envelope.metadata,
      stateIdentityVersion: 1,
      stateIdentity,
      stateIdentityExcludesTick: true,
    };
    return envelope;
  }

  function sameObservation(left, right) {
    if (!left || !right) return false;
    return stableIdentityString(normalizedObservationVector(left))
      === stableIdentityString(normalizedObservationVector(right));
  }

  async function collectState(overrides, prime, parity) {
    const inspection = await inspectState(overrides, parity);
    const input = inspection.input;
    const automatic = input.samplingMode === 'auto' || input.reason === 'interval';
    if (typeof input.expectedStateIdentity === 'string'
        && input.expectedStateIdentity !== inspection.stateIdentity) {
      throw new Error('Live state changed before automatic collection began');
    }
    if (inspection.missing.length > 0 || inspection.exhausted) return { ...inspection, capture: null };
    if (automatic && inspection.automaticEvaluationOrdinal >= 1) {
      return { ...inspection, automaticExhausted: true, capture: null };
    }

    const explicitSeed = Number.isSafeInteger(input.seed);
    const evaluationSeed = explicitSeed ? input.seed : 18427 + inspection.evaluationOrdinal;
    const primeRun = await prime.runForFaction(inspection.factionId, {
      seed: evaluationSeed,
      simulations: 320,
      cPuctMilli: 1250,
      upstreamMaskSource: 'stage2f-certified-live-parity',
    });
    if (!primeRun?.targetView || !primeRun?.legality || !primeRun?.recommendation) {
      throw new Error('Live Prime evaluation did not expose target, legality, and recommendation evidence');
    }
    if (primeRun.observation && !sameObservation(primeRun.observation, inspection.parityBundle.observation)) {
      throw new Error('Prime evaluated a different observation than the inspected live state');
    }

    const postInspection = await inspectState({ factionId: inspection.factionId }, parity);
    if (postInspection.stateIdentity !== inspection.stateIdentity) {
      throw new Error('Live state changed during Prime evaluation; capture refused');
    }

    const envelope = finalizeEnvelopeIdentity(buildEnvelope({
      ...inspection.parityBundle,
      targetView: primeRun.targetView,
      legality: primeRun.legality,
    }, inspection.factionId), inspection.stateIdentity);
    const context = { ...inspection.context, tick: envelope.payload.tick };
    const legacyEvidence = {
      derivation: LEGACY_DERIVATION_ID,
      observerId: inspection.factionId,
      seed: String(evaluationSeed),
      simulations: 320,
      cPuct: 1.25,
      sourceRecommendationId: primeRun.recommendation.recommendationId || null,
      sourceObservationId: inspection.parityBundle.observation.observationId || null,
      stateIdentity: inspection.stateIdentity,
      authority: 'R0',
    };

    stateEvaluationCounts.set(inspection.stateKey, inspection.evaluationOrdinal + 1);
    if (automatic) automaticEvaluationCounts.set(inspection.stateKey, inspection.automaticEvaluationOrdinal + 1);
    return {
      ...inspection,
      evaluationSeed,
      capture: {
        captureVersion: 1,
        context,
        envelope,
        legacyEvidence,
      },
      diagnostics: {
        ...inspection.diagnostics,
        legalityId: primeRun.legality.legalityId || null,
        recommendationId: primeRun.recommendation.recommendationId || null,
        legalMask: envelope.payload.factions[inspection.factionId].legalMask,
        knownEntityCount: envelope.payload.factions[inspection.factionId].knowledge.knownEntityIds.length,
        primeEvaluationPerformed: true,
        automatic,
      },
    };
  }

  function createProvider(collector, prime, parity) {
    return Object.freeze({
      id: BRIDGE_ID,
      version: PROVIDER_VERSION,
      authority,
      async collect(overrides = {}) {
        try {
          const result = await collectState(overrides, prime, parity);
          global.__ZEK_STAGE2F_PROVIDER_DIAGNOSTICS__ = clone(result.diagnostics);
          if (!result.capture) return null;
          lastWarningSignature = null;
          return result.capture;
        } catch (error) {
          const message = String(error?.message || error);
          if (message !== lastWarningSignature) {
            lastWarningSignature = message;
            console.warn('[Sentinel Grid Stage2F Provider v5] capture refused', { error: message, authority });
          }
          return null;
        }
      },
      async diagnose(overrides = {}) {
        try {
          const result = await inspectState(overrides, parity);
          return {
            ready: result.ready,
            missing: result.missing,
            context: result.context,
            envelopeSummary: {
              snapshotIdPreview: `zeknova-live-state-${result.stateIdentity.slice(0, 48)}`,
              tick: result.context.tick,
              factionIds: [result.factionId],
              featureCount: result.parityBundle.observation.featureVector.length,
              legalMask: null,
              legalMaskAvailableDuringDiagnostic: false,
            },
            legacySummary: {
              derivation: LEGACY_DERIVATION_ID,
              observerId: result.factionId,
              simulations: 320,
              cPuct: 1.25,
              primeEvaluationPerformed: false,
            },
            sampling: {
              stateIdentity: result.stateIdentity,
              stateKey: result.stateKey,
              evaluationOrdinal: result.evaluationOrdinal,
              evaluationsRemaining: Math.max(0, 4 - result.evaluationOrdinal),
              automaticEvaluationOrdinal: result.automaticEvaluationOrdinal,
              automaticEvaluationsRemaining: Math.max(0, 1 - result.automaticEvaluationOrdinal),
              evaluationCapPerState: 4,
              automaticEvaluationCapPerState: 1,
              exhausted: result.exhausted,
            },
            diagnostics: result.diagnostics,
            authority,
          };
        } catch (error) {
          return {
            ready: false,
            missing: ['provider.error'],
            error: String(error?.message || error),
            authority,
          };
        }
      },
    });
  }

  function tryRegister() {
    const collector = global.ZekNovaStage2FCollector;
    const prime = global.ZekNovaPrimeShadowIntegration || global.ZEK_PRIME_SHADOW_ADAPTER;
    const parity = global.ZekNovaLiveParityIntegration || global.ZEK_LIVE_PARITY_ADAPTER;
    if (!collector || typeof collector.registerProvider !== 'function' || !prime || !parity) return false;

    const provider = createProvider(collector, prime, parity);
    collector.registerProvider(provider);
    global.ZekNovaStage2FCaptureProvider = provider;
    global.__ZEK_STAGE2F_EXACT_PROVIDER_REGISTERED__ = true;
    global.__ZEK_STAGE2F_EXACT_PROVIDER_BRIDGE_ID__ = BRIDGE_ID;
    global.__ZEK_STAGE2F_EXACT_PROVIDER_VERSION__ = PROVIDER_VERSION;
    console.info('[Sentinel Grid Stage2F Provider v5] registered', { bridgeId: BRIDGE_ID, version: PROVIDER_VERSION, authority });
    return true;
  }

  if (tryRegister()) return;
  let attempts = 0;
  const timer = global.setInterval(() => {
    attempts += 1;
    if (tryRegister() || attempts >= 480) global.clearInterval(timer);
  }, 250);
})(globalThis);
