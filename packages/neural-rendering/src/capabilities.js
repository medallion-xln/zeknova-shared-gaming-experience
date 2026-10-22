/** Detect what THIS machine can do for neural rendering. Never installs anything. */
export async function detectLocalCapabilities({ navigator = globalThis.navigator, platform = null } = {}) {
  const result = { webgpu: false, adapter: null, platform: platform ?? navigator?.platform ?? (globalThis.process?.platform ?? "unknown"), userAgent: navigator?.userAgent ?? null, browserCanHostModel: false, upstreamInferenceHost: { os: "Linux", gpu: "NVIDIA", localPossible: null, reason: null }, recommendation: null, checkedAt: Date.now() };
  try {
    if (navigator?.gpu) { result.webgpu = true; const adapter = await navigator.gpu.requestAdapter(); if (adapter) { const info = adapter.info ?? (typeof adapter.requestAdapterInfo === "function" ? await adapter.requestAdapterInfo() : null); result.adapter = info ? { vendor: info.vendor ?? null, architecture: info.architecture ?? null, device: info.device ?? null, description: info.description ?? null } : { vendor: "unknown" }; } }
  } catch (error) { result.adapterError = String(error?.message ?? error); }
  const isMac = /mac/i.test(result.platform); const nvidia = /nvidia/i.test(result.adapter?.vendor ?? "") || /nvidia/i.test(result.adapter?.description ?? "");
  result.upstreamInferenceHost.localPossible = !isMac && nvidia ? "unknown-needs-linux-cuda-check" : false;
  result.upstreamInferenceHost.reason = isMac ? "upstream inference requires Linux + NVIDIA CUDA; macOS has no tested MPS path" : (nvidia ? "NVIDIA adapter visible; CUDA/driver/Python 3.12 must be verified on a Linux host" : "no NVIDIA adapter detected by the browser");
  result.recommendation = result.upstreamInferenceHost.localPossible === false ? "Run the Matrix-Game 4 service on a separate Linux/NVIDIA host and connect through the loopback-tunnelled adapter; use NATIVE or the labelled MOCK backend locally." : "Verify CUDA toolchain on this host before attempting upstream inference.";
  return Object.freeze(result);
}
