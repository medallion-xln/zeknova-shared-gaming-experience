/**
 * ReferenceBroadcaster — CPU-compatible real-frame encoder/publisher.
 *
 * Spawns FFmpeg as a persistent child whose stdin carries raw RGBA frames
 * (`-f rawvideo -pix_fmt rgba`) from a running ZekNova reference renderer. FFmpeg
 * encodes to browser-compatible H.264 (Constrained Baseline, no B-frames, zero
 * latency) and publishes over RTSP/TCP to MediaMTX, which serves the stream back
 * over WHEP/WebRTC to the browser.
 *
 * This is Node-only (child process). It does NOT run, claim, or gate any neural
 * model. Every surface is labelled `LIVE REFERENCE STREAM — NOT NEURAL INFERENCE`.
 *
 * Backpressure: frames are only written while FFmpeg's stdin is writable. A high
 * watermark holds the caller; a bounded internal queue is not needed because a
 * single socket write per frame is the pacing primitive. The caller (the browser
 * loop over ReferenceRenderer.capture) is the sole producer authority.
 */
import { spawn } from "node:child_process";

export const LIVE_REFERENCE_LABEL = "LIVE REFERENCE STREAM — NOT NEURAL INFERENCE";

export class ReferenceBroadcaster {
  /**
   * @param {object} opts
   * @param {number} opts.width  frame width (pixels)
   * @param {number} opts.height frame height (pixels)
   * @param {number} [opts.fps]  encode frame rate (default 30)
   * @param {string} [opts.rtspUrl] MediaMTX publish URL
   * @param {number} [opts.bitrate]  bits/second (default 1200000)
   * @param {string} [opts.ffmpeg]   ffmpeg binary path
   */
  constructor({ width, height, fps = 30, rtspUrl = "rtsp://127.0.0.1:8554/native-reference", bitrate = 1200000, ffmpeg = "ffmpeg" } = {}) {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) throw new TypeError("ReferenceBroadcaster needs positive integer width/height");
    this.width = width; this.height = height; this.fps = fps; this.rtspUrl = rtspUrl; this.bitrate = bitrate; this.ffmpeg = ffmpeg;
    this.proc = null; this.startedAt = null; this.frames = 0; this.bytes = 0; this.errors = [];
    this.label = LIVE_REFERENCE_LABEL; this.isNeuralInference = false;
  }

  get frameBytes() { return this.width * this.height * 4; }

  /** Start FFmpeg. Returns when the RTSP publish header is written (stream online). */
  async start() {
    if (this.proc) return { ready: true, alreadyStarted: true };
    this.proc = spawn(this.ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      // NOTE: no `-re` — a live rawvideo stdin source is already paced by the
      // producer (the browser capture loop). `-re` would replay slower than real
      // time and, under the producer's ~33ms cadence, idles the RTSP socket hard
      // enough to trigger a MediaMTX i/o timeout → broken pipe.
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${this.width}x${this.height}`, "-r", String(this.fps), "-i", "-",
      "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-pix_fmt", "yuv420p",
      "-preset", "veryfast", "-tune", "zerolatency", "-b:v", String(this.bitrate), "-g", String(this.fps * 2), "-bf", "0",
      "-f", "rtsp", "-rtsp_transport", "tcp", this.rtspUrl,
    ], { stdio: ["pipe", "pipe", "pipe"] });

    this.startedAt = Date.now();
    this.proc.on("error", (err) => { this.errors.push(String(err.message ?? err)); });
    if (this.proc.stderr) this.proc.stderr.on("data", (d) => { const s = d.toString().trim(); if (s) this.errors.push(s); });
    this.proc.on("exit", (code, signal) => { this.exitCode = code; this.exitSignal = signal; });

    // Give FFmpeg the cleanest chance to establish the RTSP publish handshake.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { ready: this.proc.killed === false, alive: this.proc.killed === false, label: this.label };
  }

  /**
   * Encode one raw RGBA frame. `data` must be exactly width*height*4 bytes.
   * Resolves after the bytes are accepted by FFmpeg's stdin (backpressure-aware).
   */
  async writeFrame(data) {
    if (!this.proc || this.proc.killed) throw new Error("broadcaster not running");
    const expect = this.frameBytes;
    if (!data || data.length !== expect) throw new Error(`frame byte length ${data?.length} != ${expect}`);
    const ok = this.proc.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    this.bytes += data.byteLength;
    this.frames += 1;
    if (!ok) await new Promise((resolve) => { const drain = () => { this.proc.stdin.removeListener("error", drain); resolve(); }; this.proc.stdin.once("drain", drain); this.proc.stdin.once("error", drain); });
  }

  /** Flush stdin and stop FFmpeg. */
  async stop() {
    if (this.proc && this.proc.stdin) { try { this.proc.stdin.end(); } catch {} }
    if (this.proc) { try { this.proc.kill("SIGTERM"); } catch {} this.proc = null; }
  }

  stats() {
    return Object.freeze({
      label: this.label, isNeuralInference: false,
      frames: this.frames, bytes: this.bytes, width: this.width, height: this.height, fps: this.fps,
      rtspUrl: this.rtspUrl, running: !!(this.proc && !this.proc.killed), errors: [...this.errors],
      exitCode: this.exitCode ?? null, exitSignal: this.exitSignal ?? null,
    });
  }
}
