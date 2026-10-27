/**
 * CLI: start the ZGE-16.2 reference stream server (loopback).
 *
 *   node --input-type=module scripts/zge16-2-reference-server.mjs
 *
 * Requires MediaMTX already running (loopback). Listens on 127.0.0.1:8791 for
 * raw-RGBA frame POSTs, encodes via FFmpeg → H.264 → RTSP → MediaMTX → WHEP.
 */
import { ReferenceStreamServer } from "../packages/neural-bridge/src/node.js";

const width = Number(process.env.REF_WIDTH ?? 640);
const height = Number(process.env.REF_HEIGHT ?? 360);
const fps = Number(process.env.REF_FPS ?? 30);
const rtspUrl = process.env.REF_RTSP_URL ?? "rtsp://127.0.0.1:8554/native-reference";

const server = new ReferenceStreamServer({ width, height, fps, rtspUrl });
const { port, baseUrl } = await server.start({ port: 8791 });
console.log(`[ref-server] ${server.broadcaster.label}`);
console.log(`[ref-server] frame endpoint ${baseUrl}/frame  (${width}x${height} rgba @${fps}fps)`);
console.log(`[ref-server] health ${baseUrl}/health`);
console.log(`[ref-server] publishing ${rtspUrl}`);

process.on("SIGINT", async () => { console.log("\n[ref-server] shutting down"); await server.close(); process.exit(0); });
process.on("SIGTERM", async () => { await server.close(); process.exit(0); });
