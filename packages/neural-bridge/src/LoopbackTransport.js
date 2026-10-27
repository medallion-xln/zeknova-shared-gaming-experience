/**
 * LoopbackTransport — in-process reference-frame transport certification.
 *
 * Frames a real ZekNova reference capture through the bridge ingest pipe and back
 * out (echo) over a functional HTTP server bound to loopback. This certifies the
 * transport (envelope, framing, backpressure, ordering) against REAL byte payloads,
 * not that any neural model ran.
 *
 * Every serialized frame is explicitly tagged `REFERENCE TRANSPORT TEST — NOT
 * NEURAL INFERENCE`, and the mode is surfaced in the marker and the stats so no
 * loopback frame can ever be mistaken for generated video.
 */
import http from "node:http";
import { validateReferenceFrame, INGEST_ERROR, BRIDGE_LIMITS, TRANSPORT_TEST_LABEL, BRIDGE_ROUTES } from "./protocol.js";
import { encodeFrameEnvelope, decodeFrameEnvelope } from "../../rendering/src/index.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class LoopbackTransport {
  constructor({ bridge, expectedWidth = BRIDGE_LIMITS.captureWidth, expectedHeight = BRIDGE_LIMITS.captureHeight } = {}) {
    if (!bridge) throw new TypeError("LoopbackTransport needs a ReferenceIngestBridge");
    this.bridge = bridge; this.expectedWidth = expectedWidth; this.expectedHeight = expectedHeight;
    this.transmitted = 0; this.echoed = 0; this.latenciesMs = []; this.server = null; this.port = null;
  }

  /** Translate one bridge-ingested frame into an echoed reference-frame envelope, real bytes out. */
  echo(frame) {
    const validated = validateReferenceFrame(frame, { expectedWidth: this.expectedWidth, expectedHeight: this.expectedHeight });
    if (!validated.ok) return { ok: false, ...validated };
    // Emit the SAME pytest bytes, but re-stamped so any consumer sees the transport label.
    const envelope = encodeFrameEnvelope(frame, {
      ...frame.metadata,
      protocol: "zge-reference-bridge/0",
      transportTest: true,
      label: TRANSPORT_TEST_LABEL,
      isNeuralInference: false,
    });
    this.echoed += 1;
    return { ok: true, envelope, frameIndex: frame.metadata.frameIndex };
  }

  async start({ port = 0 } = {}) {
    const bridge = this.bridge;
    const self = this;
    this.server = http.createServer(async (req, res) => {
      const host = (req.headers.host || "").split(":")[0];
      if (!LOOPBACK.has(host)) { res.writeHead(403, { "Content-Type": "text/plain" }); return res.end("Only loopback hosts are supported"); }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
      const readBytes = () => new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); });

      if (req.method === "GET" && url.pathname === BRIDGE_ROUTES.health) {
        return json(200, { protocol: "zge-reference-bridge/0", label: TRANSPORT_TEST_LABEL, ready: true, isNeuralInference: false, stats: bridge.stats() });
      }
      if (req.method === "POST" && url.pathname === BRIDGE_ROUTES.reference) {
        if (req.headers["content-type"] && !req.headers["content-type"].startsWith("application/octet-stream")) { res.writeHead(415); return res.end("Expected application/octet-stream"); }
        const bytes = new Uint8Array(await readBytes());
        if (bytes.length === 0) { res.writeHead(400); return res.end("Empty reference frame"); }
        let decoded;
        try { decoded = decodeFrameEnvelope(bytes); } catch (error) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ code: INGEST_ERROR.CORRUPT_FRAME, message: error.message })); }
        const frame = { ...decoded.frame, kind: "capture", metadata: decoded.metadata };
        const start = performance.now();
        const result = bridge.ingest(frame);
        const elapsed = performance.now() - start;
        if (!result.accepted) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ code: result.code, message: result.message })); }
        const echoed = self.echo(frame);
        self.transmitted += 1; self.latenciesMs.push(elapsed);
        res.writeHead(200, { "Content-Type": "application/json", "X-ZGE-Bridge": "zge-reference-bridge/0", "X-ZGE-Transport-Test": "1" });
        return res.end(JSON.stringify({ accepted: true, frameIndex: result.frameIndex, label: TRANSPORT_TEST_LABEL, isNeuralInference: false, echoedBytes: echoed.envelope?.byteLength ?? 0 }));
      }
      res.writeHead(404); res.end();
    });
    await new Promise((resolve) => this.server.listen(port, "127.0.0.1", () => { this.port = this.server.address().port; resolve(); }));
    return { port: this.port, baseUrl: `http://127.0.0.1:${this.port}` };
  }

  stats() { return Object.freeze({ transmitted: this.transmitted, echoed: this.echoed, label: TRANSPORT_TEST_LABEL, isNeuralInference: false, latenciesMs: [...this.latenciesMs] }); }

  async close() { if (this.server) await new Promise((r) => this.server.close(r)); this.server = null; }
}
