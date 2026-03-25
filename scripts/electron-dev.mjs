import { forwardExitSignals, spawnManagedProcess, waitForPort } from "./desktop-runtime.mjs";

const nextProcess = spawnManagedProcess("pnpm", ["dev"], {
  env: {
    ...process.env,
    PORT: "4731",
  },
});

nextProcess.once("exit", (code) => {
  if (code && code !== 0) {
    process.exit(code);
  }
});

try {
  await waitForPort({ port: 4731, timeoutMs: 60_000 });
} catch (error) {
  nextProcess.kill("SIGTERM");
  throw error;
}

const electronProcess = spawnManagedProcess("pnpm", ["exec", "electron", "."], {
  env: {
    ...process.env,
    GHAT_DESKTOP_URL: "http://127.0.0.1:4731/dashboard",
  },
});

forwardExitSignals([nextProcess, electronProcess]);

electronProcess.once("exit", (code) => {
  nextProcess.kill("SIGTERM");
  process.exit(code ?? 0);
});
