// Bundle-size budget for the client build (run after `next build`).
// - total: every client JS chunk, gzip (includes the lazily loaded map and chart engines)
// - initial: JS referenced by the prerendered overview page, gzip (what a first visit downloads)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET = { totalKb: 900, initialKb: 300 };
const root = join(import.meta.dirname, "..", ".next");
const chunksDir = join(root, "static", "chunks");

const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

const js = walk(chunksDir).filter((f) => f.endsWith(".js"));
const sizes = js.map((f) => ({ f: f.slice(chunksDir.length + 1), kb: gz(f) / 1024 })).sort((a, b) => b.kb - a.kb);
const total = sizes.reduce((s, x) => s + x.kb, 0);

const html = readFileSync(join(root, "server", "app", "en.html"), "utf8");
const referenced = new Set([...html.matchAll(/\/_next\/static\/chunks\/([^"'\s]+?\.js)/g)].map((m) => m[1]));
const initial = sizes.filter((s) => referenced.has(s.f)).reduce((s, x) => s + x.kb, 0);

const out = [
  `client JS (gzip): total ${total.toFixed(0)} KB / budget ${BUDGET.totalKb} KB, initial (overview) ${initial.toFixed(0)} KB / budget ${BUDGET.initialKb} KB`,
  "largest chunks:",
  ...sizes.slice(0, 6).map((s) => `  ${s.kb.toFixed(1).padStart(7)} KB  ${s.f}`),
];
process.stdout.write(out.join("\n") + "\n");
if (total > BUDGET.totalKb || initial > BUDGET.initialKb) {
  process.stderr.write("bundle budget exceeded\n");
  process.exit(1);
}
