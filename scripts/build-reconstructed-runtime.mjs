import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "src/runtime-reconstructed/runtime-build.json"), "utf8"));

async function bytes(relative) {
  return readFile(path.join(root, relative));
}

const compatibility = Buffer.concat(await Promise.all(config.compatibility.segments.map(bytes)));
const model = await bytes(config.model.entrypoint);

for (const [relative, content] of [
  [config.compatibility.output, compatibility],
  [config.model.output, model],
]) {
  const output = path.join(root, relative);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, content);
}

