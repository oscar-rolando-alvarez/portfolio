/**
 * Eval CI gate:  npm run eval
 * Runs the golden claims set through the full system (deterministic fake LLM by default) and
 * exits non-zero if accuracy, policy-violation or cost thresholds are not met.
 * Against a real model:  LLM_PROVIDER=openai_compatible LLM_BASE_URL=... LLM_MODEL=... npm run eval
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PROJECT_ROOT } from '../config.ts';
import { runEvals, toMarkdown } from './harness.ts';

const report = await runEvals({});
const outDir = `${PROJECT_ROOT}evals-report`;
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${outDir}/report.md`, toMarkdown(report));
console.log(toMarkdown(report));
for (const r of report.results.filter(
  (x) => !(x.routingOk && x.outcomeOk && x.payoutOk) || x.violations.length > 0,
)) {
  console.log(
    `\nMISMATCH ${r.id}: expected ${JSON.stringify(r.expected)} got ${JSON.stringify(r.actual)} violations=${JSON.stringify(r.violations)}`,
  );
}
if (!report.passed) {
  console.error(`\nEVAL GATE FAILED: ${report.failures.join(', ')}`);
  process.exit(1);
}
console.log('\nEVAL GATE PASSED');
