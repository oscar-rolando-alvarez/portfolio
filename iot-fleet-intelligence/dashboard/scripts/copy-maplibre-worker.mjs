// Copies maplibre's self-contained worker into public/vendor so it is served
// same-origin (see src/components/map/fleet-map.tsx). Runs before dev and build.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "maplibre-gl");
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const out = join(root, "public", "vendor");
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, "dist", "maplibre-gl-worker.mjs"), join(out, `maplibre-gl-worker-${version}.mjs`));
process.stdout.write(`maplibre-gl worker ${version} -> public/vendor` + "\n");
