import { spawn } from "node:child_process";

const production = process.argv.includes("--production");
const environment = production ? "production" : "local";
const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || "8790";
const address = `http://${host}:${port}`;

console.log(`ZekNova ${environment} environment: ${address}`);
if (!production) console.log("Medallion authentication is disabled for this local development process.");

const server = spawn("php", ["-S", `${host}:${port}`], {
  stdio: "inherit",
  env: { ...process.env, ZEKNOVA_ENV: environment },
});

server.on("error", (error) => {
  console.error("Unable to start PHP. Install PHP and ensure `php` is available on PATH.");
  console.error(error.message);
  process.exitCode = 1;
});

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
