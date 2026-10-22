/** In-memory stand-in for api/save.php: revision + operationId dedupe + baseRevision stale check + auth/size rules. */
export function createFakeSaveServer({ authenticated = true, failures = [] } = {}) {
  const server = { personal: null, revision: 0, posts: [], gets: 0, authenticated, failures: [...failures], postFailures: [], script: [] };
  server.fetch = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    if (!server.authenticated) return json(401, { error: "Sign in" });
    if (server.failures.length) { const f = server.failures.shift(); if (f === "network") throw new TypeError("Failed to fetch"); if (f === "hang") return new Promise((_, reject) => { const signal = init.signal; if (signal?.aborted) reject(Object.assign(new Error("aborted"), { name: "AbortError" })); signal?.addEventListener?.("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); }); if (typeof f === "number") return json(f, { error: `injected ${f}` }); }
    if (method === "POST" && server.postFailures.length) { const f = server.postFailures.shift(); if (f === "network") throw new TypeError("Failed to fetch"); if (typeof f === "number") return json(f, { error: `injected ${f}` }); }
    if (method === "GET") { server.gets += 1; return json(200, { save: server.personal ? { ...server.personal, persistence: { ...(server.personal.persistence ?? {}), revision: server.revision, baseRevision: server.revision } } : null }); }
    const body = JSON.parse(init.body);
    if (![1, 2, 3, 4].includes(body.version) || !Array.isArray(body.buildings)) return json(422, { error: "Invalid save snapshot." });
    if (body.buildings.length > 3000) return json(413, { error: "Save exceeds the prototype building limit." });
    const op = body.persistence?.operationId ?? "";
    if (op && op === server.personal?.persistence?.operationId) return json(200, { ok: true, duplicate: true, revision: server.revision });
    const base = body.persistence?.baseRevision;
    if (Number.isFinite(base) && base < server.revision) return json(409, { error: `Save snapshot is stale at revision ${server.revision}.` });
    server.revision += 1; server.personal = { ...body, updatedAt: new Date().toISOString(), persistence: { revision: server.revision, baseRevision: server.revision, operationId: op } }; server.posts.push(body);
    return json(200, { ok: true, duplicate: false, revision: server.revision });
  };
  return server;
}
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
