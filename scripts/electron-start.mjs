import fs from "node:fs";
import path from "node:path";
import {
  forwardExitSignals,
  projectRoot,
  spawnManagedProcess,
  waitForPort,
} from "./desktop-runtime.mjs";

const standaloneServerPath = path.join(projectRoot, ".next", "standalone", "server.js");

if (!fs.existsSync(standaloneServerPath)) {
  throw new Error(
    "Missing .next/standalone/server.js. Run `pnpm build` before `pnpm desktop:start`.",
  );
}

const serverProcess = spawnManagedProcess("node", [standaloneServerPath], {
  env: {
    ...process.env,
    PORT: "4731",
    HOSTNAME: "127.0.0.1",
  },
});

serverProcess.once("exit", (code) => {
  if (code && code !== 0) {
    process.exit(code);
  }
});

try {
  await waitForPort({ port: 4731, timeoutMs: 30_000 });
} catch (error) {
  serverProcess.kill("SIGTERM");
  throw error;
}

const electronProcess = spawnManagedProcess("pnpm", ["exec", "electron", "."], {
  env: {
    ...process.env,
    GHAT_DESKTOP_URL: "http://127.0.0.1:4731/dashboard",
  },
});

forwardExitSignals([serverProcess, electronProcess]);

electronProcess.once("exit", (code) => {
  serverProcess.kill("SIGTERM");
  process.exit(code ?? 0);
});
