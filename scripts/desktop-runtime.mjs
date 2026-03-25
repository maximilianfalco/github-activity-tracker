import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "..");

export function spawnManagedProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });
}

export async function waitForPort({
  host = "127.0.0.1",
  port,
  timeoutMs = 30_000,
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const reachable = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });

      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });

      socket.once("error", () => {
        resolve(false);
      });
    });

    if (reachable) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Timed out waiting for ${host}:${port}`);
}

export function forwardExitSignals(children) {
  const stopChildren = () => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };

  process.on("SIGINT", () => {
    stopChildren();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    stopChildren();
    process.exit(143);
  });

  process.on("exit", stopChildren);
}
