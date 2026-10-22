/**
 * The legacy bundle imports the same runtime modules under several `?v=` cache-busters, which the
 * browser treats as distinct module instances (ZGE-00: 6 model-runtime instances, 7 loader/queue
 * pairs). An import map collapses every variant onto one canonical URL without editing the bundle.
 */
export const CANONICAL_RUNTIME_MODULES = Object.freeze({
  "./assets/model-runtime-c96327ba.js": /^\.\/model-runtime-c96327ba\.js(\?.*)?$/,
  "./assets/environment-runtime.js": /^\.\/environment-runtime\.js(\?.*)?$/,
  "./assets/model-runtime.js": /^\.\/model-runtime\.js(\?.*)?$/,
});

/** Extract dynamic/static import specifiers from bundle source text. */
export function scanImportSpecifiers(source) {
  const out = new Set();
  for (const m of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.add(m[1]);
  for (const m of source.matchAll(/from\s*["']([^"']+)["']/g)) out.add(m[1]);
  return [...out];
}

/** Build the import-map entries for every variant specifier found in the bundle (keys relative to the document). */
export function buildImportMap(specifiers, { bundleDir = "./assets/" } = {}) {
  const imports = {};
  for (const spec of specifiers) {
    for (const [canonical, pattern] of Object.entries(CANONICAL_RUNTIME_MODULES)) {
      if (!pattern.test(spec)) continue;
      const key = bundleDir + spec.replace(/^\.\//, "");
      if (key !== canonical) imports[key] = canonical;
    }
  }
  return { imports: Object.fromEntries(Object.entries(imports).sort()) };
}

export function parseImportMapFromHtml(html) {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!m) return null;
  return JSON.parse(m[1]);
}
