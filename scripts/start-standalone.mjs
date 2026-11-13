import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
}

const serverDir = join(root, ".next", "standalone");
const serverFile = join(serverDir, "server.js");

if (!existsSync(serverFile)) {
  console.error("Missing .next/standalone/server.js. Run `pnpm build` first.");
  process.exit(1);
}

process.chdir(serverDir);
await import(pathToFileURL(serverFile).href);