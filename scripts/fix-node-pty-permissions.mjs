import fs from "node:fs";
import path from "node:path";

const candidates = [
  "node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
  "node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-x64/spawn-helper",
];

for (const relativePath of candidates) {
  const targetPath = path.resolve(relativePath);
  if (!fs.existsSync(targetPath)) continue;

  const currentMode = fs.statSync(targetPath).mode;
  const executableMode = currentMode | 0o111;

  if (currentMode !== executableMode) {
    fs.chmodSync(targetPath, executableMode);
  }
}
