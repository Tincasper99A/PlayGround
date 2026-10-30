import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(projectRoot, "src");
const output = join(projectRoot, "dist");

if (!existsSync(join(source, "index.html"))) {
  throw new Error(`Missing source entry: ${join(source, "index.html")}`);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });

console.log(`Built ${output}`);
