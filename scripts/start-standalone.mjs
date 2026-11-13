import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const serverDir = join(process.cwd(), ".next", "standalone");
const serverFile = join(serverDir, "server.js");

if (!existsSync(serverFile)) {
  console.error("Missing .next/standalone/server.js. Run `pnpm build` first.");
  process.exit(1);
}

process.chdir(serverDir);
await import(pathToFileURL(serverFile).href);