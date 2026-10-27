/**
 * @zge/neural-bridge — reference-frame ingestion bridge for Matrix-Game 4
 * conditioning. CPU-compatible; no model, no GPU, no gameplay authority.
 *
 * Browser-safe entry: everything here (protocol, ReferenceIngestBridge,
 * WHEPReceiver) is importable without a Node runtime. The Node-only loopback
 * HTTP transport is a nested export so a browser bundle never pulls `node:http`.
 */
export {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  BRIDGE_LIMITS,
  BRIDGE_ROUTES,
  TRANSPORT_TEST_LABEL,
  INGEST_ERROR,
  INGEST_ERROR_KEYS,
  validateMetadata,
  validateCameraSettings,
  validateReferenceFrame,
  validateOrder,
} from "./protocol.js";
export { ReferenceIngestBridge } from "./ReferenceIngestBridge.js";
export { WHEPReceiver, WHEP_STATES, parseIceServers, trickleFragment } from "./WHEPReceiver.js";
// Node-only: LoopbackTransport imports `node:http`; a browser build must import it
// via the subpath `@zge/neural-bridge/node` instead of the root barrel.
export const TRANSPORT_TEST_LABEL_NOTE = "LoopbackTransport is a Node-only export (import '@zge/neural-bridge/node')";
