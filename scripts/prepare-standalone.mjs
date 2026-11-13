import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.warn("No standalone output found; skip asset copy.");
  process.exit(0);
}

cpSync(join(root, "public"), join(standalone, "public"), { recursive: true, force: true });
mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
  force: true,
});
console.log("Prepared standalone assets.");