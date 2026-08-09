/**
 * TEMPLATE ONLY — no live runtime imports and no world mutation.
 *
 * Replace the explicit TODO functions with read-only exports from the existing
 * certified ZekNova Stage 1A-Z observation, knowledge, legality, target-slot,
 * and detached clone systems. Do not register the adapter until parity passes.
 */
import { writeFile } from 'node:fs/promises';

function notImplemented(name) {
  throw new Error(`${name} is intentionally not bound. Complete parity work before use.`);
}

const observerId = process.argv[2];
const output = process.argv[3];
if (!observerId || !output) {
  console.error('Usage: node export-snapshot.template.mjs OBSERVER_ID OUTPUT.json');
  process.exit(2);
}

const envelope = {
  snapshotContractVersion: 1,
  snapshotId: `zeknova-shadow-${Date.now()}`,
  gameId: 'zeknova',
  adapterId: 'zeknova-stage1az-shadow-adapter',
  adapterVersion: '1.0.0-development',
  formatId: 'zeknova/stage1az-shadow-json',
  formatVersion: 1,
  observers: [observerId],
  payload: {
    canonicalObservation592: notImplemented('readCanonicalObservation592'),
    legalActionMask6: notImplemented('readLegalActionMask6'),
    canonicalTargetSlots: notImplemented('readCanonicalTargetSlots'),
    knowledgeSnapshot: notImplemented('readFactionPrivateKnowledge'),
    detachedSimulationState: notImplemented('cloneDetachedSimulationState'),
  },
  metadata: { authority: 'R0', source: 'read-only-template' },
};
await writeFile(output, `${JSON.stringify(envelope, null, 2)}
`);
