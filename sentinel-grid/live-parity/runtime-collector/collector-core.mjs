import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const CAPTURE_ID_RE = /^[a-zA-Z0-9._:-]{1,180}$/;
const SESSION_ID_RE = /^[a-zA-Z0-9._:-]{1,160}$/;
const SAMPLING_STATE_ID_RE = /^[a-f0-9]{64}$/;

function assert(condition, message, code = 'COLLECTOR_CONTRACT_ERROR') {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : stableStringify(value));
  return createHash('sha256').update(bytes).digest('hex');
}

export async function atomicWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function listJson(directory) {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

function validateConfig(config) {
  assert(config && typeof config === 'object', 'Collector config must be an object');
  assert(config.schemaVersion === 1, 'Collector config schemaVersion must be 1');
  assert(config.host === '127.0.0.1' || config.host === '::1', 'Collector must bind to loopback only');
  assert(Number.isInteger(config.port) && config.port >= 1024 && config.port <= 65535, 'Collector port is invalid');
  assert(typeof config.token === 'string' && config.token.length >= 32, 'Collector token must contain at least 32 characters');
  for (const field of ['zeknovaRoot', 'kernelPath', 'liveParityRoot', 'collectorId', 'environmentId']) {
    assert(typeof config[field] === 'string' && config[field].length > 0, `Collector config ${field} is required`);
  }
  assert(Array.isArray(config.runtimeFiles) && config.runtimeFiles.length >= 3, 'At least three runtime files are required for build provenance');
  assert(config.evidenceMode === 'QUALIFICATION' || config.evidenceMode === 'DRY_RUN', 'Collector evidenceMode must be explicit');
  return structuredClone(config);
}

export async function computeRuntimeProvenance(configInput) {
  const config = validateConfig(configInput);
  let repositoryHead;
  let repositoryDirty = null;
  try {
    repositoryHead = (await execFileAsync('git', ['-C', config.zeknovaRoot, 'rev-parse', 'HEAD'])).stdout.trim().toLowerCase();
    assert(/^[a-f0-9]{40}$/.test(repositoryHead), 'Repository HEAD is not a 40-character Git hash');
    const statusResult = await execFileAsync('git', ['-C', config.zeknovaRoot, 'status', '--porcelain=v1']);
    repositoryDirty = statusResult.stdout.trim().length > 0;
  } catch (error) {
    if (!config.allowNonGitRuntime) throw new Error(`Unable to establish Git repository provenance: ${error.message}`);
    repositoryHead = sha256({ root: path.resolve(config.zeknovaRoot), fallback: true });
    repositoryDirty = true;
  }

  const files = [];
  for (const relative of [...config.runtimeFiles].sort()) {
    assert(!path.isAbsolute(relative) && !relative.split(path.sep).includes('..'), `Runtime file path is unsafe: ${relative}`);
    const absolute = path.join(config.zeknovaRoot, relative);
    const fileStat = await stat(absolute).catch(() => null);
    assert(fileStat?.isFile(), `Required runtime provenance file is missing: ${relative}`);
    const bytes = await readFile(absolute);
    files.push({ path: relative.replaceAll(path.sep, '/'), bytes: bytes.length, sha256: sha256(bytes) });
  }
  const buildDocument = {
    buildManifestVersion: 1,
    repositoryHead,
    repositoryDirty,
    files,
  };
  return Object.freeze({
    repositoryHead,
    repositoryDirty,
    runtimeBuildHash: sha256(buildDocument),
    buildDocument: Object.freeze({ ...buildDocument, runtimeBuildHash: sha256(buildDocument) }),
  });
}

async function loadKernel(config) {
  const nonce = Date.now();
  const contextUrl = pathToFileURL(path.join(config.kernelPath, 'scripts', 'production-context.mjs')).href;
  const shadowUrl = pathToFileURL(path.join(config.kernelPath, 'src', 'lab', 'zeknova-real-state-shadow.js')).href;
  const controlledUrl = pathToFileURL(path.join(config.kernelPath, 'src', 'lab', 'zeknova-controlled-evaluation.js')).href;
  const identityUrl = pathToFileURL(path.join(config.kernelPath, 'src', 'lab', 'zeknova-stage2f-identity.js')).href;
  const contractsUrl = pathToFileURL(path.join(config.kernelPath, 'src', 'core', 'contracts.js')).href;
  const determinismUrl = pathToFileURL(path.join(config.kernelPath, 'src', 'core', 'determinism.js')).href;
  const legacyUrl = pathToFileURL(path.join(config.kernelPath, 'src', 'compat', 'zeknova-stage1az-legacy.js')).href;
  const [{ loadProductionRegistry }, shadow, controlled, identity, contracts, determinism, legacy] = await Promise.all([
    import(`${contextUrl}?collector=${nonce}`),
    import(`${shadowUrl}?collector=${nonce}`),
    import(`${controlledUrl}?collector=${nonce}`),
    import(`${identityUrl}?collector=${nonce}`),
    import(`${contractsUrl}?collector=${nonce}`),
    import(`${determinismUrl}?collector=${nonce}`),
    import(`${legacyUrl}?collector=${nonce}`),
  ]);
  const { registry } = await loadProductionRegistry();
  const registration = registry.get('zeknova:zeknova-stage1az-shadow-adapter');
  return { registration, shadow, controlled, identity, contracts, determinism, legacy };
}

async function loadQualificationContext(config, kernel) {
  const identityPath = path.resolve(config.runtimeIdentityPath ?? path.join(config.kernelPath, 'artifacts', 'r0-runtime-identity', 'canonical-runtime-identity.json'));
  const provenancePath = path.resolve(config.generatedRuntimeProvenancePath ?? path.join(config.kernelPath, 'artifacts', 'r0-runtime-identity', 'generated-runtime-provenance.json'));
  const campaignPath = path.resolve(config.campaignManifestPath ?? path.join(config.kernelPath, 'artifacts', 'r0-runtime-identity', 'stage2f-campaign-manifest.json'));
  const [runtimeIdentity, generatedRuntimeProvenance, rawCampaign] = await Promise.all([readJson(identityPath), readJson(provenancePath), readJson(campaignPath)]);
  const campaignManifest = kernel.identity.validateStage2FCampaignManifest(rawCampaign, { runtimeIdentity, generatedRuntimeProvenance });
  assert(campaignManifest.sentinelRuntimeId === runtimeIdentity.sentinelRuntimeId, 'Campaign runtime identity is not current', 'RUNTIME_ID_MISMATCH');
  assert(campaignManifest.generatedRuntimeProvenanceId === generatedRuntimeProvenance.generatedRuntimeProvenanceId, 'Campaign generated provenance is not current', 'PROVENANCE_ID_MISMATCH');
  const evidenceMode = config.evidenceMode;
  assert(evidenceMode === campaignManifest.campaignMode, 'Collector evidence mode does not match the campaign manifest', 'CAMPAIGN_ID_MISMATCH');
  return Object.freeze({ runtimeIdentity, generatedRuntimeProvenance, campaignManifest, evidenceMode, identityPath, provenancePath, campaignPath });
}

export function deriveCertifiedLegacyEvidence(kernel, envelope, request) {
  assert(kernel?.legacy && kernel?.contracts && kernel?.determinism, 'Certified legacy derivation modules are unavailable');
  assert(envelope && typeof envelope === 'object' && !Array.isArray(envelope), 'Snapshot envelope is required for legacy derivation');
  assert(request && typeof request === 'object' && !Array.isArray(request), 'Legacy derivation request must be an object');
  assert(request.derivation === 'sentinel-grid-stage2f-certified-legacy-v1', 'Unsupported legacy evidence derivation mode');
  const observerId = request.observerId;
  assert(typeof observerId === 'string' && observerId.length > 0, 'Legacy derivation observerId is required');
  const seed = BigInt(request.seed);
  const simulations = request.simulations;
  const cPuct = request.cPuct;
  assert(Number.isInteger(simulations) && simulations > 0, 'Legacy derivation simulations must be positive');
  assert(Number.isFinite(cPuct) && cPuct > 0, 'Legacy derivation cPuct must be positive');

  const state = structuredClone(envelope.payload);
  const actions = kernel.legacy.legacyLegalActions(state, observerId)
    .sort((a, b) => kernel.contracts.actionKey(a).localeCompare(kernel.contracts.actionKey(b)));
  const transitions = actions.map((action, index) => {
    const result = kernel.legacy.legacyStep(state, action, {
      seed,
      simulationIndex: index,
      stochasticAmplitude: 0.015,
    });
    return {
      actionKey: kernel.contracts.actionKey(action),
      stateHash: kernel.determinism.sha256(result.state),
      reward: result.reward,
      terminal: result.terminal,
    };
  });
  const recommendation = kernel.legacy.legacyRecommend({
    state,
    observerId,
    seed,
    simulations,
    cPuct,
    stochasticAmplitude: 0.015,
  });
  return {
    derivation: request.derivation,
    sourceRecommendationId: request.sourceRecommendationId ?? null,
    sourceObservationId: request.sourceObservationId ?? null,
    observerId,
    seed: String(seed),
    simulations,
    cPuct,
    sourceStateHash: kernel.determinism.sha256(state),
    observationHash: kernel.determinism.sha256(kernel.legacy.legacyObservation(state, observerId)),
    legalMask: kernel.legacy.legacyMask(state, observerId),
    legalMaskHash: kernel.determinism.sha256(kernel.legacy.legacyMask(state, observerId)),
    targetSlotsHash: kernel.determinism.sha256(kernel.legacy.legacyTargets(state, observerId)),
    legalActionKeys: actions.map(kernel.contracts.actionKey),
    transitions,
    outcomeScalar: kernel.legacy.legacyOutcome(state, observerId),
    recommendation,
    authority: 'R0',
  };
}


export function samplingStateIdentityFromCapture(capture) {
  assert(capture && typeof capture === 'object' && !Array.isArray(capture), 'Capture is required for sampling identity');
  const envelopeIdentity = capture.envelope?.metadata?.stateIdentity;
  const requestedIdentity = capture.legacyEvidence?.stateIdentity;

  assert(
    typeof envelopeIdentity === 'string' && SAMPLING_STATE_ID_RE.test(envelopeIdentity),
    'Capture envelope metadata.stateIdentity must be a lowercase SHA-256 hex string',
    'SAMPLING_STATE_IDENTITY_INVALID',
  );

  if (requestedIdentity !== undefined && requestedIdentity !== null) {
    assert(
      typeof requestedIdentity === 'string' && SAMPLING_STATE_ID_RE.test(requestedIdentity),
      'Capture legacyEvidence.stateIdentity must be a lowercase SHA-256 hex string',
      'SAMPLING_STATE_IDENTITY_INVALID',
    );
    assert(
      requestedIdentity === envelopeIdentity,
      'Capture envelope and legacy evidence sampling identities do not match',
      'SAMPLING_STATE_IDENTITY_MISMATCH',
    );
  }

  const expectedSnapshotId = `zeknova-live-state-${envelopeIdentity.slice(0, 48)}`;
  assert(
    capture.envelope?.snapshotId === expectedSnapshotId,
    'Capture snapshotId is not bound to metadata.stateIdentity',
    'SAMPLING_STATE_IDENTITY_UNBOUND',
  );

  return envelopeIdentity;
}

function samplingStateIdentityFromStoredFixture(fixture) {
  const value = fixture?.envelope?.metadata?.stateIdentity;
  return typeof value === 'string' && SAMPLING_STATE_ID_RE.test(value) ? value : null;
}

function normalizeSessionMetadata(input, config) {
  const value = input && typeof input === 'object' ? input : {};
  const environmentId = typeof value.environmentId === 'string' && value.environmentId.length > 0
    ? value.environmentId
    : config.environmentId;
  return {
    environmentId,
    label: typeof value.label === 'string' ? value.label.slice(0, 160) : null,
    playerCount: Number.isInteger(value.playerCount) && value.playerCount >= 0 ? value.playerCount : null,
    gameMode: typeof value.gameMode === 'string' ? value.gameMode.slice(0, 120) : null,
  };
}

function safeSessionId(value) {
  if (value !== undefined && value !== null) {
    assert(typeof value === 'string' && SESSION_ID_RE.test(value), 'Requested sessionId is invalid');
    return value;
  }
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `zeknova-live-${stamp}-${randomBytes(8).toString('hex')}`;
}

function validateCaptureInput(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'Capture request must be an object');
  assert(input.capture && typeof input.capture === 'object' && !Array.isArray(input.capture), 'capture is required');
  const capture = structuredClone(input.capture);
  assert(capture.context && typeof capture.context === 'object', 'capture.context is required');
  assert(capture.envelope && typeof capture.envelope === 'object', 'capture.envelope is required');
  assert(capture.legacyEvidence && typeof capture.legacyEvidence === 'object', 'capture.legacyEvidence is required');
  return capture;
}

async function loadRecordsForSession(root, sessionId) {
  const recordsDir = path.join(root, 'records');
  const records = [];
  for (const name of await listJson(recordsDir)) {
    const record = await readJson(path.join(recordsDir, name));
    if (record.context?.sessionId === sessionId) records.push(record);
  }
  return records;
}

export async function createCollectorRuntime(configInput) {
  const config = validateConfig(configInput);
  const provenance = await computeRuntimeProvenance(config);
  const kernel = await loadKernel(config);
  const qualification = await loadQualificationContext(config, kernel);
  const stateRoot = path.join(config.liveParityRoot, 'runtime-collector', 'state');
  const fixtureDir = path.join(config.liveParityRoot, 'fixtures');
  const recordsDir = path.join(config.liveParityRoot, 'records');
  const sessionsDir = path.join(config.liveParityRoot, 'sessions');
  const quarantineDir = path.join(config.liveParityRoot, 'quarantine');
  const runtimeSessionsDir = path.join(stateRoot, 'sessions');
  for (const directory of [fixtureDir, recordsDir, sessionsDir, quarantineDir, runtimeSessionsDir]) await mkdir(directory, { recursive: true });

  const samplingStateIndex = new Map();
  let samplingStateIdentityMissingCount = 0;
  let samplingStateIdentityInvalidBindingCount = 0;
  let samplingStateIdentityDuplicateEvidenceCount = 0;

  for (const name of await listJson(fixtureDir)) {
    const fixture = await readJson(path.join(fixtureDir, name));
    const identity = samplingStateIdentityFromStoredFixture(fixture);
    if (!identity) {
      samplingStateIdentityMissingCount += 1;
      continue;
    }
    if (fixture.envelope?.snapshotId !== `zeknova-live-state-${identity.slice(0, 48)}`) {
      samplingStateIdentityInvalidBindingCount += 1;
      continue;
    }
    const existingRecord = await readJson(path.join(recordsDir, name)).catch(() => null);
    if (samplingStateIndex.has(identity)) {
      samplingStateIdentityDuplicateEvidenceCount += 1;
      continue;
    }
    samplingStateIndex.set(identity, {
      captureId: fixture.captureId ?? name.replace(/\.json$/, ''),
      recordHash: existingRecord?.recordHash ?? null,
      sourceStateHash: existingRecord?.sourceStateHash ?? null,
    });
  }

  const activeSessions = new Map();
  for (const name of await listJson(runtimeSessionsDir)) {
    try {
      const session = await readJson(path.join(runtimeSessionsDir, name));
      if (session.status === 'active') activeSessions.set(session.sessionId, session);
    } catch { /* malformed runtime session state is ignored and cannot certify */ }
  }

  async function persistRuntimeSession(session) {
    await atomicWriteJson(path.join(runtimeSessionsDir, `${session.sessionId}.json`), session);
  }

  async function buildRollingManifest(session, endedAt = new Date().toISOString()) {
    const records = await loadRecordsForSession(config.liveParityRoot, session.sessionId);
    if (records.length === 0) return null;
    const manifest = kernel.controlled.buildZekNovaSessionManifest({
      sessionId: session.sessionId,
      environmentId: session.environmentId,
      repositoryHead: provenance.repositoryHead,
      runtimeBuildHash: provenance.runtimeBuildHash,
      collectorId: config.collectorId,
      startedAt: session.startedAt,
      endedAt,
      records,
      campaignManifest: qualification.campaignManifest,
    });
    await atomicWriteJson(path.join(sessionsDir, `${session.sessionId}.json`), manifest);
    return manifest;
  }

  async function startSession(input = {}) {
    const sessionId = safeSessionId(input.sessionId);
    assert(!activeSessions.has(sessionId), `Session is already active: ${sessionId}`, 'SESSION_EXISTS');
    const metadata = normalizeSessionMetadata(input, config);
    assert(input.evidenceMode === qualification.evidenceMode, 'Session evidenceMode must explicitly match the configured campaign', 'CAMPAIGN_ID_MISMATCH');
    if (qualification.evidenceMode === 'QUALIFICATION') {
      assert(qualification.campaignManifest.campaignState === 'ACTIVE' && qualification.campaignManifest.qualificationEligible === true, 'Qualification campaign is not active', 'STALE_CAMPAIGN');
    } else {
      assert(qualification.evidenceMode === 'DRY_RUN' && qualification.campaignManifest.qualificationEligible === false, 'Dry-run campaign cannot be qualification eligible', 'AUTHORITY_MISMATCH');
    }
    const session = {
      sessionStateVersion: 1,
      sessionId,
      environmentId: metadata.environmentId,
      metadata,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'active',
      nextSequence: 0,
      acceptedRecordCount: 0,
      duplicateRecordCount: 0,
      rejectedRecordCount: 0,
      repositoryHead: provenance.repositoryHead,
      runtimeBuildHash: provenance.runtimeBuildHash,
      collectorId: config.collectorId,
      stage2fCampaignId: qualification.campaignManifest.stage2fCampaignId,
      sentinelRuntimeId: qualification.campaignManifest.sentinelRuntimeId,
      generatedRuntimeProvenanceId: qualification.campaignManifest.generatedRuntimeProvenanceId,
      evidenceMode: qualification.evidenceMode,
      qualificationEligible: qualification.campaignManifest.qualificationEligible,
      authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    };
    activeSessions.set(sessionId, session);
    await persistRuntimeSession(session);
    return {
      ...structuredClone(session),
      qualificationIdentityBase: {
        identityEnvelopeVersion: kernel.identity.STAGE2F_QUALIFICATION_IDENTITY_VERSION,
        sentinelRuntimeId: qualification.campaignManifest.sentinelRuntimeId,
        generatedRuntimeProvenanceId: qualification.campaignManifest.generatedRuntimeProvenanceId,
        stage2fCampaignId: qualification.campaignManifest.stage2fCampaignId,
        sessionId,
        recordSchemaVersion: qualification.campaignManifest.recordSchemaVersion,
        collectorSchemaVersion: qualification.campaignManifest.collectorSchemaVersion,
        authorityTier: 'R0',
        evidenceMode: qualification.evidenceMode,
        qualificationEligible: qualification.campaignManifest.qualificationEligible,
        canonicalStateSchemaVersion: qualification.campaignManifest.canonicalStateSchemaVersion,
        primeVersion: qualification.campaignManifest.primeVersion,
        routerVersion: qualification.campaignManifest.routerVersion,
        authorityPolicyVersion: qualification.campaignManifest.authorityPolicyVersion,
        certificationPolicyVersion: qualification.campaignManifest.certificationPolicyVersion,
      },
    };
  }

  async function submitCapture(input) {
    const requestedSession = input?.sessionId;
    assert(typeof requestedSession === 'string' && requestedSession.length > 0, 'sessionId is required');
    const session = activeSessions.get(requestedSession);
    assert(session?.status === 'active', `Active session not found: ${requestedSession}`, 'SESSION_NOT_ACTIVE');
    const capture = validateCaptureInput(input);
    let samplingStateIdentity;
    try {
      samplingStateIdentity = samplingStateIdentityFromCapture(capture);
      kernel.identity.validateStage2FQualificationIdentity(capture.qualificationIdentity, {
        campaignManifest: qualification.campaignManifest,
        sessionId: session.sessionId,
        samplingIdentity: samplingStateIdentity,
      });
    } catch (error) {
      session.rejectedRecordCount += 1;
      await persistRuntimeSession(session);
      await atomicWriteJson(path.join(quarantineDir, `rejected-${session.sessionId}-${String(session.nextSequence).padStart(6, '0')}-${randomBytes(4).toString('hex')}.json`), {
        quarantineVersion: 2,
        capturedAt: new Date().toISOString(),
        sessionId: session.sessionId,
        sequence: session.nextSequence,
        reason: error.message,
        code: error.code ?? 'CAPTURE_REJECTED',
        inputHash: sha256(input),
        authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
      });
      throw error;
    }
    if (capture.legacyEvidence?.derivation === 'sentinel-grid-stage2f-certified-legacy-v1') {
      capture.legacyEvidence = deriveCertifiedLegacyEvidence(kernel, capture.envelope, capture.legacyEvidence);
    }
    const sequence = session.nextSequence;
    const capturedAt = new Date().toISOString();
    const unsignedIdentity = {
      sessionId: session.sessionId,
      sequence,
      envelope: capture.envelope,
      legacyEvidence: capture.legacyEvidence,
      qualificationIdentity: capture.qualificationIdentity,
    };
    const captureId = `${session.sessionId}:${String(sequence).padStart(6, '0')}:${sha256(unsignedIdentity).slice(0, 20)}`;
    assert(CAPTURE_ID_RE.test(captureId), 'Generated captureId is invalid');
    capture.captureVersion = 1;
    capture.captureId = captureId;
    capture.capturedAt = capturedAt;
    capture.context = { ...capture.context, sessionId: session.sessionId, sequence };
    capture.source = {
      kind: 'live-runtime',
      productionEligible: capture.qualificationIdentity.qualificationEligible === true,
      repositoryHead: provenance.repositoryHead,
      repositoryDirty: provenance.repositoryDirty,
      runtimeBuildHash: provenance.runtimeBuildHash,
      collectorId: config.collectorId,
      collectorVersion: '1.0.0',
      capturedAt,
      transport: 'loopback-http',
      authority: 'R0',
      sentinelRuntimeId: capture.qualificationIdentity.sentinelRuntimeId,
      generatedRuntimeProvenanceId: capture.qualificationIdentity.generatedRuntimeProvenanceId,
      stage2fCampaignId: capture.qualificationIdentity.stage2fCampaignId,
      evidenceMode: capture.qualificationIdentity.evidenceMode,
      qualificationEligible: capture.qualificationIdentity.qualificationEligible,
    };

    try {
      kernel.shadow.validateZekNovaLiveCapture(capture, { campaignManifest: qualification.campaignManifest });

      const existingSamplingState = samplingStateIndex.get(samplingStateIdentity);
      if (existingSamplingState) {
        session.duplicateRecordCount += 1;
        await persistRuntimeSession(session);
        return {
          accepted: false,
          duplicate: true,
          duplicateReason: 'sampling-state-identity',
          samplingStateIdentity,
          captureId,
          existingCaptureId: existingSamplingState.captureId,
          existingRecordHash: existingSamplingState.recordHash,
          existingSourceStateHash: existingSamplingState.sourceStateHash,
          sequence,
        };
      }

      const evaluation = kernel.shadow.evaluateZekNovaLiveCapture({
        adapter: kernel.registration.adapter,
        manifest: kernel.registration.manifest,
        configuration: kernel.registration.configuration,
        capture,
        campaignManifest: qualification.campaignManifest,
      });
      const existingNames = await listJson(recordsDir);
      for (const name of existingNames) {
        const existing = await readJson(path.join(recordsDir, name));
        if (existing.fixtureHash === evaluation.record.fixtureHash) {
          session.duplicateRecordCount += 1;
          await persistRuntimeSession(session);
          return {
            accepted: false,
            duplicate: true,
            duplicateReason: 'fixture-hash',
            samplingStateIdentity,
            captureId,
            existingRecordHash: existing.recordHash,
            sequence,
          };
        }
      }
      await atomicWriteJson(path.join(fixtureDir, `${captureId}.json`), capture);
      await atomicWriteJson(path.join(recordsDir, `${captureId}.json`), evaluation.record);
      samplingStateIndex.set(samplingStateIdentity, {
        captureId,
        recordHash: evaluation.record.recordHash,
        sourceStateHash: evaluation.record.sourceStateHash,
      });
      session.nextSequence += 1;
      session.acceptedRecordCount += 1;
      await persistRuntimeSession(session);
      const manifest = await buildRollingManifest(session, capturedAt);
      return {
        accepted: true,
        duplicate: false,
        samplingStateIdentity,
        captureId,
        sequence,
        recordHash: evaluation.record.recordHash,
        recordPass: evaluation.record.pass,
        manifestHash: manifest?.manifestHash ?? null,
        agreement: evaluation.record.agreement,
        authority: evaluation.record.authority,
      };
    } catch (error) {
      session.rejectedRecordCount += 1;
      await persistRuntimeSession(session);
      const quarantine = {
        quarantineVersion: 1,
        capturedAt,
        sessionId: session.sessionId,
        sequence,
        reason: error.message,
        code: error.code ?? 'CAPTURE_REJECTED',
        inputHash: sha256(input),
        authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
      };
      await atomicWriteJson(path.join(quarantineDir, `rejected-${session.sessionId}-${String(sequence).padStart(6, '0')}-${randomBytes(4).toString('hex')}.json`), quarantine);
      throw error;
    }
  }

  async function endSession(input) {
    const sessionId = input?.sessionId;
    assert(typeof sessionId === 'string' && sessionId.length > 0, 'sessionId is required');
    const session = activeSessions.get(sessionId);
    assert(session?.status === 'active', `Active session not found: ${sessionId}`, 'SESSION_NOT_ACTIVE');
    const endedAt = new Date().toISOString();
    const manifest = await buildRollingManifest(session, endedAt);
    session.status = 'closed';
    session.endedAt = endedAt;
    await persistRuntimeSession(session);
    activeSessions.delete(sessionId);
    return { session: structuredClone(session), manifest };
  }

  async function status() {
    const recordCount = (await listJson(recordsDir)).length;
    const fixtureCount = (await listJson(fixtureDir)).length;
    const manifestCount = (await listJson(sessionsDir)).length;
    const quarantineCount = (await listJson(quarantineDir)).length;
    return {
      collectorVersion: '1.0.0',
      collectorId: config.collectorId,
      online: true,
      host: config.host,
      port: config.port,
      activeSessions: [...activeSessions.values()].map((entry) => ({
        sessionId: entry.sessionId,
        startedAt: entry.startedAt,
        nextSequence: entry.nextSequence,
        acceptedRecordCount: entry.acceptedRecordCount,
        rejectedRecordCount: entry.rejectedRecordCount,
      })),
      fixtureCount,
      recordCount,
      manifestCount,
      quarantineCount,
      samplingStateIdentityCount: samplingStateIndex.size,
      samplingStateIdentityMissingCount,
      samplingStateIdentityInvalidBindingCount,
      samplingStateIdentityDuplicateEvidenceCount,
      provenance: {
        repositoryHead: provenance.repositoryHead,
        repositoryDirty: provenance.repositoryDirty,
        runtimeBuildHash: provenance.runtimeBuildHash,
        runtimeFileCount: provenance.buildDocument.files.length,
      },
      qualification: {
        stage2fCampaignId: qualification.campaignManifest.stage2fCampaignId,
        sentinelRuntimeId: qualification.campaignManifest.sentinelRuntimeId,
        generatedRuntimeProvenanceId: qualification.campaignManifest.generatedRuntimeProvenanceId,
        campaignState: qualification.campaignManifest.campaignState,
        evidenceMode: qualification.evidenceMode,
        qualificationEligible: qualification.campaignManifest.qualificationEligible,
        recordSchemaVersion: qualification.campaignManifest.recordSchemaVersion,
        collectorSchemaVersion: qualification.campaignManifest.collectorSchemaVersion,
      },
      authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    };
  }

  return Object.freeze({ config, provenance, qualification, startSession, submitCapture, endSession, status });
}
