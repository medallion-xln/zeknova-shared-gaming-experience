/**
 * Node-only barrel for @zge/neural-bridge. Exposes the loopback HTTP transport,
 * which imports `node:http` and is therefore not part of the browser-safe root
 * barrel. Import this with `@zge/neural-bridge/node` (or the relative
 * `./node.js` in this repo's source layout).
 */
export { LoopbackTransport } from "./LoopbackTransport.js";
export { ReferenceBroadcaster, LIVE_REFERENCE_LABEL } from "./ReferenceBroadcaster.js";
export { ReferenceStreamServer } from "./ReferenceStreamServer.js";
export * from "./index.js";
