/**
 * ReferenceStreamServer — Node-only loopback server bridging a running ZekNova
 * browser scene to the FFmpeg encoder → MediaMTX → WHEP/WebRTC pipeline.
 *
 * The browser scene captures real reference frames (ReferenceRenderer) and POSTs
 * them here as `application/octet-stream` RGBA. This server validates size,
 * forwards the bytes to a ReferenceBroadcaster (ffmpeg rawvideo→H264→RTSP), and
 * MediaMTX serves the stream back over WHEP.
 *
 * Loopback-only, labelled. Never neural inference; never gameplay authority.
 *
 * POST /frame        body = width*height*4 raw RGBA bytes        → 204
 * POST /frame        body size mismatch                          → 400
 * GET  /health                                                    → 200
 * POST /start  {width,height,fps,rtspUrl}  (re)start the encoder  → 200
 * POST /stop                                                      → 200
 */
import http from "node:http";
import { ReferenceBroadcaster, LIVE_REFERENCE_LABEL } from "./ReferenceBroadcaster.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class ReferenceStreamServer {
  constructor({ width = 640, height = 360, fps = 30, rtspUrl = "rtsp://127.0.0.1:8554/native-reference", ffmpeg = "ffmpeg" } = {}) {
    this.width = width; this.height = height; this.fps = fps; this.rtspUrl = rtspUrl; this.ffmpeg = ffmpeg;
    this.broadcaster = new ReferenceBroadcaster({ width, height, fps, rtspUrl, ffmpeg });
    this.server = null; this.port = null; this.received = 0; this.rejected = 0; this.lastFrameAt = null;
  }

  async start({ port = 0 } = {}) {
    await this.broadcaster.start();
    const self = this;
    this.server = http.createServer(async (req, res) => {
      const host = (req.headers.host || "").split(":")[0];
      if (!LOOPBACK.has(host)) { res.writeHead(403); return res.end("Only loopback hosts are supported"); }
      // Loopback-only origin allow-list for the browser scene (ZekNova web origin).
      const origin = req.headers.origin;
      if (origin && ["http://127.0.0.1:8790", "http://localhost:8790"].includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
      const readBytes = () => new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); });

      if (req.method === "GET" && url.pathname === "/health") {
        return json(200, { label: LIVE_REFERENCE_LABEL, isNeuralInference: false, ready: !!self.broadcaster.proc, ...self.broadcaster.stats(), transport: { received: self.received, rejected: self.rejected, lastFrameAt: self.lastFrameAt } });
      }
      if (req.method === "POST" && url.pathname === "/frame") {
        const bytes = new Uint8Array(await readBytes());
        const expect = self.width * self.height * 4;
        if (bytes.length !== expect) { self.rejected += 1; return json(400, { code: "DIMENSIONS", expected: expect, got: bytes.length, label: LIVE_REFERENCE_LABEL }); }
        try { await self.broadcaster.writeFrame(bytes); self.received += 1; self.lastFrameAt = Date.now(); }
        catch (error) { self.rejected += 1; return json(500, { code: "ENCODER", message: String(error.message ?? error) }); }
        res.writeHead(204); return res.end();
      }
      if (req.method === "POST" && url.pathname === "/stop") {
        await self.broadcaster.stop();
        return json(200, { label: LIVE_REFERENCE_LABEL, stopped: true });
      }
      if (req.method === "POST" && url.pathname === "/start") {
        const body = JSON.parse((await readBytes()).toString() || "{}");
        if (Number.isInteger(body.width)) { self.width = body.width; self.broadcaster.width = body.width; }
        if (Number.isInteger(body.height)) { self.height = body.height; self.broadcaster.height = body.height; }
        await self.broadcaster.start();
        return json(200, { label: LIVE_REFERENCE_LABEL, started: true, width: self.width, height: self.height });
      }
      res.writeHead(404); return res.end();
    });
    await new Promise((resolve) => this.server.listen(port, "127.0.0.1", () => { this.port = this.server.address().port; resolve(); }));
    return { port: this.port, baseUrl: `http://127.0.0.1:${this.port}` };
  }

  async close() { await this.broadcaster.stop(); if (this.server) await new Promise((r) => this.server.close(r)); this.server = null; }
}
