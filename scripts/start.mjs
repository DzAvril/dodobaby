import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["server.js"], { stdio: "inherit", env: process.env }),
  spawn(process.execPath, ["scripts/notification-worker.mjs"], { stdio: "inherit", env: process.env }),
];
let stopping = false;
let exitCode = 0;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => stop(signal));
for (const child of children) child.once("exit", (code, signal) => {
  if (!stopping) {
    console.error(`Process ${child.spawnargs.join(" ")} exited`, { code, signal });
    exitCode = code || 1;
    stop("SIGTERM");
  }
  process.exitCode = exitCode;
});
