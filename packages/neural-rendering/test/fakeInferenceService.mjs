/**
 * Loopback test service implementing the upstream Matrix-Game 4 HTTP control contract
 * (/api/status, /api/start, /api/{id}/stop, loopback-only origin guard, JSON-only POST,
 * 16 KB control cap) PLUS the proposed zge-reference-bridge/0 echo endpoint. It is a
 * TEST DOUBLE: there is no model, no GPU, no WebRTC. Frames are transformed by the mock.
 */
import http from "node:http";
import { decodeFrameEnvelope, encodeFrameEnvelope } from "../../rendering/src/index.js";
import { mockTransform } from "../src/MockNeuralBackend.js";

export function startFakeInferenceService({ port = 0, fps = 20, modelWidth = 864, modelHeight = 480, failReferenceAfter = null } = {}) {
  let active = null, previous = null, served = 0, sessions = 0, referenceCalls = 0;
  const server = http.createServer(async (req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) { res.writeHead(403); return res.end("Only loopback hosts are supported"); }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    const read = () => new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); });
    if (req.method === "GET" && url.pathname === "/api/status") return json(200, { ready: true, fps, active: active?.id ?? null, config: { scene: "zge-test-double", preset: "mock", model: "none" }, report: active ? { served } : null });
    if (req.method === "POST" && url.pathname === "/api/start") {
      if (req.headers["content-type"] !== "application/json") { res.writeHead(415); return res.end("Expected application/json"); }
      const body = await read(); if (body.length > 16384) { res.writeHead(413); return res.end(); }
      let parsed; try { parsed = JSON.parse(body.toString()); } catch { res.writeHead(400); return res.end("Invalid JSON"); }
      if (!["model", "reference"].includes(parsed.mode ?? "model")) { res.writeHead(400); return res.end("Model not available"); }
      if (active) { res.writeHead(409); return res.end("Only one active session is allowed"); }
      sessions += 1; active = { id: `native-${sessions}`, mode: parsed.mode ?? "model" }; previous = null;
      return json(200, { id: active.id, fps, monitor: !!parsed.monitor, whep: `http://127.0.0.1:8890/${active.id}/whep` });
    }
    const m = url.pathname.match(/^\/api\/([^/]+)\/(stop|reference)$/);
    if (m) {
      if (!active || active.id !== m[1]) { res.writeHead(410); return res.end("Session is no longer active"); }
      if (m[2] === "stop" && req.method === "POST") { active = null; return json(200, { stopped: true }); }
      if (m[2] === "reference" && req.method === "POST") {
        referenceCalls += 1; if (failReferenceAfter !== null && referenceCalls > failReferenceAfter) { res.writeHead(503); return res.end("injected failure"); }
        const bytes = new Uint8Array(await read());
        let decoded; try { decoded = decodeFrameEnvelope(bytes); } catch (error) { res.writeHead(400); return res.end(String(error.message)); }
        const out = mockTransform(decoded.frame, previous, { modelWidth, modelHeight, frameIndex: decoded.metadata.frameIndex }); previous = out.data; served += 1;
        const envelope = encodeFrameEnvelope(out, { sourceFrameIndex: decoded.metadata.frameIndex, sessionId: decoded.metadata.sessionId, simulationTime: decoded.metadata.simulationTime, mock: true, model: { id: "zge-test-double", mock: true } });
        res.writeHead(200, { "Content-Type": "application/octet-stream" }); return res.end(Buffer.from(envelope));
      }
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, baseUrl: `http://127.0.0.1:${server.address().port}`, stats: () => ({ served, sessions, referenceCalls, active }), close: () => new Promise((r) => server.close(r)) })));
}
