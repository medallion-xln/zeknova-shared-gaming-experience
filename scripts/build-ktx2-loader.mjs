import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, "assets/vendor");
const basisDirectory = resolve(outputDirectory, "basis");
mkdirSync(basisDirectory, { recursive: true });

await build({
  entryPoints: [resolve(root, "node_modules/three/examples/jsm/loaders/KTX2Loader.js")],
  outfile: resolve(outputDirectory, "KTX2Loader.bundle.js"),
  bundle: true,
  format: "esm",
  minify: true,
  plugins: [{
    name: "zeknova-local-three",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^three$/ }, () => ({
        path: "./three.module.min.js",
        external: true,
      }));
    },
  }],
});

for (const file of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
  cpSync(
    resolve(root, "node_modules/three/examples/jsm/libs/basis", file),
    resolve(basisDirectory, file),
  );
}

console.log("Bundled local KTX2Loader and Basis transcoder runtime.");
