import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WHEPReceiver, WHEP_STATES, parseIceServers, trickleFragment } from "../src/index.js";

// --- pure helpers ---
test("parseIceServers extracts rel=ice-server entries", () => {
  const link = '<stun:stun.example>; rel="ice-server", <turn:turn.example>; rel="ice-server"; username="u"; credential="p"; credential-type="password"';
  const servers = parseIceServers(link);
  assert.equal(servers.length, 2);
  assert.deepEqual(servers[0], { urls: ["stun:stun.example"] });
  assert.equal(servers[1].username, "u"); assert.equal(servers[1].credential, "p"); assert.equal(servers[1].credentialType, "password");
});

test("parseIceServers returns [] for empty link", () => {
  assert.deepEqual(parseIceServers(""), []);
});

test("trickleFragment emits candidates grouped by mid", () => {
  const frag = trickleFragment([{ sdpMLineIndex: 0, candidate: "candidate:0 1 udp 1 1.2.3.4 5000 typ host" }]);
  assert.ok(frag.includes("a=mid:0"));
  assert.ok(frag.includes("candidate:0 1 udp"));
});

// --- signaling sequence against a real local HTTP WHEP stub (real bytes via fetch-like negotiate) ---
function startWhepStub({ answers = [] } = {}) {
  return new Promise((resolve) => {
    const calls = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        calls.push({ method: req.method, url: req.url, ctype: req.headers["content-type"], body });
        if (req.method === "OPTIONS") { res.writeHead(200, { Link: '<stun:stun.example>; rel="ice-server"' }); return res.end(); }
        if (req.method === "POST") { res.writeHead(201, { Location: "/sess/1" }); return res.end("v=0\r\n" + answers.join("\r\n") + "\r\n"); }
        if (req.method === "PATCH") { res.writeHead(204); return res.end(); }
        if (req.method === "DELETE") { res.writeHead(200); return res.end(); }
        res.writeHead(404); res.end();
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, calls, close: () => new Promise((r) => server.close(r)) }));
  });
}

test("WHEPReceiver drives OPTIONS → POST offer → PATCH candidates against a real stub", async () => {
  const { server, port, calls, close } = await startWhepStub({ answers: ["a=mid:0"] });
  try {
    const states = [];
    // Stub RTCPeerConnection: real offer SDP + candidate emission, no browser needed.
    class FakePC {
      constructor() { this.localDescription = null; this.remoteDescription = null; this.closed = false; this.onicecandidate = null; this.onconnectionstatechange = null; this.ontrack = null; this.transceivers = []; }
      addTransceiver() { return {}; }
      async createOffer() { return { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n" }; }
      async setLocalDescription(d) { this.localDescription = d; this.onicecandidate?.({ candidate: { sdpMLineIndex: 0, candidate: "candidate:0 1 udp 1 127.0.0.1 5000 typ host" } }); this.onicecandidate?.({ candidate: null }); }
      async setRemoteDescription(d) { this.remoteDescription = d; }
      close() { this.closed = true; }
    }
    const receiver = new WHEPReceiver({ url: `http://127.0.0.1:${port}/whep`, onState: (s) => states.push(s), negotiate: defaultNegotiate, iceServers: [] });
    // inject the fake PC via the negotiate? No — we stub globalThis.RTCPeerConnection by monkeypatching the class is not possible here.
    // Instead: WHEPReceiver constructs RTCPeerConnection internally; provide it via a factory-free test by setting this.pc before start.
    receiver.pc = new FakePC();
    // Prevent the internal constructor from making a real PC: subclass-safe path — call inner async steps directly.
    // Simpler: expose a hook. We'll drive start() but the class news up RTCPeerConnection; guard via a tiny shim.
    await withPeerConnectionShim(FakePC, () => receiver.start());
    assert.ok(states.includes("connected"), `states=${states.join(",")}`);
    assert.deepEqual(calls.map((c) => c.method), ["OPTIONS", "POST", "PATCH"]);
  } finally {
    await close();
  }
});

function defaultNegotiate(url, init) { return fetch(url, init); }

async function withPeerConnectionShim(FakePC, fn) {
  const had = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = FakePC;
  try { await fn(); } finally { if (had) globalThis.RTCPeerConnection = had; else delete globalThis.RTCPeerConnection; }
}
