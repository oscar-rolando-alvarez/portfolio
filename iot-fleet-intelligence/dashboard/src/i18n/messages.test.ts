import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}|<(\w+)>/g)].map((m) => m[1] ?? m[2]).sort();

const EN = flatten(en as Tree);
const ES = flatten(es as Tree);

/**
 * Static keys used in the source: `const t = useTranslations("ns")` then `t("key")`.
 * A variable name may be bound to different namespaces in different components of
 * one file, so a call is satisfied if the key exists under any of them.
 */
function missingKeys(): { count: number; missing: string[] } {
  let count = 0;
  const missing: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) {
        const src = readFileSync(p, "utf8");
        const ns = new Map<string, Set<string>>();
        for (const m of src.matchAll(/const (\w+) = (?:useTranslations|await getTranslations)\((?:\{[^}]*namespace: )?(?:"([\w.]+)")?/g)) {
          if (!ns.has(m[1]!)) ns.set(m[1]!, new Set());
          ns.get(m[1]!)!.add(m[2] ? `${m[2]}.` : "");
        }
        for (const m of src.matchAll(/\b(\w+)(?:\.rich)?\("([\w.]+)"/g)) {
          const candidates = ns.get(m[1]!);
          if (!candidates) continue;
          count += 1;
          if (![...candidates].some((prefix) => `${prefix}${m[2]}` in EN)) missing.push(`${p.split("/src/")[1]}: ${m[1]}("${m[2]}")`);
        }
      }
    }
  };
  walk(join(__dirname, ".."));
  return { count, missing };
}

describe("message catalogs", () => {
  it("EN and ES have identical key sets", () => {
    expect(Object.keys(ES).sort()).toEqual(Object.keys(EN).sort());
  });

  it("every translation keeps the same ICU placeholders and rich tags", () => {
    for (const k of Object.keys(EN)) {
      expect(placeholders(ES[k] ?? ""), k).toEqual(placeholders(EN[k]!));
    }
  });

  it("no empty strings and Spanish is actually translated", () => {
    expect(Object.values(EN).every(Boolean)).toBe(true);
    expect(Object.values(ES).every(Boolean)).toBe(true);
    const same = Object.keys(EN).filter((k) => EN[k] === ES[k] && EN[k]!.length > 12);
    // identical long strings are allowed only for proper nouns / product names
    expect(same.filter((k) => !k.startsWith("cost.category.") && k !== "nav.product")).toEqual([]);
  });

  it("every statically referenced key exists", () => {
    const { count, missing } = missingKeys();
    expect(count).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});
