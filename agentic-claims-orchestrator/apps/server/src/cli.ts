/**
 * CLI:
 *   node apps/server/src/cli.ts demo [--scenario S05] [--reject]   offline end-to-end run (no DB, no network, no API key)
 *   node apps/server/src/cli.ts run --file claim.json              run a custom FNOL offline
 *   node apps/server/src/cli.ts graph                              print the agent graph (Mermaid)
 *   node apps/server/src/cli.ts migrate                            apply PostgreSQL migrations (DATABASE_URL)
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClaimsGraph, type Principal } from '@aco/core';
import { createDatabase, runMigrations } from '@aco/infra';
import { loadConfig } from './config.ts';
import { createContainer } from './container.ts';
import { loadGoldenSet } from './evals/harness.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    scenario: { type: 'string', default: 'S05' },
    file: { type: 'string' },
    reject: { type: 'boolean', default: false },
  },
});
const command = positionals[0] ?? 'demo';

const color = (code: number) => (s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = color(1);
const dim = color(2);
const green = color(32);
const yellow = color(33);
const cyan = color(36);

async function runClaim(fnol: unknown, label: string): Promise<void> {
  const config = loadConfig({
    ...process.env,
    STORAGE: 'memory',
    MCP_TRANSPORT: 'in-process',
    LLM_PROVIDER: process.env.LLM_PROVIDER ?? 'fake',
  });
  const c = await createContainer(config);
  const intake: Principal = { id: 'portal-intake', tenantId: 'demo', roles: ['claims_intake'] };
  const reviewer: Principal = {
    id: 'alex.adjuster',
    tenantId: 'demo',
    roles: ['adjuster', 'senior_adjuster', 'siu_investigator', 'auditor'],
  };
  try {
    console.log(bold(`\n== Agentic claims orchestrator - offline demo: ${label}`));
    console.log(
      dim(
        `   LLM: ${c.llm.provider}/${c.llm.model} | MCP: in-process | store: in-memory | policy ${c.policy.policyVersion}\n`,
      ),
    );

    let { claim } = await c.service.submit(intake, fnol, `demo-${Date.now()}`, { wait: true });
    console.log(`${cyan('claim')} ${claim.claimId}  status=${claim.status}`);
    console.log(
      `  intake     severity=${claim.intake?.severity ?? '-'} flags=[${claim.intake?.flags.join(', ') ?? ''}]`,
    );
    console.log(`             "${claim.intake?.summary ?? ''}"`);
    console.log(
      `  extraction documented=${claim.extraction?.documentedAmount ?? 'n/a'} consistency=${claim.extraction?.consistency ?? '-'}`,
    );
    console.log(
      `  coverage   covered=${claim.coverage?.covered ?? false} reasons=[${claim.coverage?.reasons.join(', ') ?? ''}] payable=${claim.coverage?.payableAmount ?? 0}`,
    );
    if (claim.fraud) {
      console.log(
        `  fraudRisk  score=${claim.fraud.score} band=${claim.fraud.band} model=${claim.fraud.modelVersion}`,
      );
      console.log(`             "${claim.fraud.rationale}"`);
    }
    console.log(`  decision   ${claim.decision?.outcome ?? '-'} payout=${claim.decision?.payoutAmount ?? 0}`);
    console.log(`             "${claim.decision?.summary ?? ''}"`);
    console.log(
      `  routing    ${bold(claim.routing?.routing ?? '-')} rules=[${claim.routing?.ruleIds.join(', ') ?? ''}]`,
    );

    if (claim.status === 'awaiting_approval' && claim.pendingApproval) {
      const a = claim.pendingApproval;
      console.log(
        yellow(`\n  PAUSED - human approval required (${a.requiredRole}): ${a.reasons.join(' | ')}`),
      );
      const decision = values.reject
        ? {
            decision: 'override',
            outcome: 'deny',
            comment: 'Reviewer override in demo: insufficient evidence of covered loss.',
          }
        : { decision: 'approve', comment: 'Reviewed documents; proposal accepted.' };
      console.log(dim(`  -> ${reviewer.id} submits ${JSON.stringify(decision)}`));
      claim = await c.service.decide(reviewer, claim.claimId, a.approvalId, decision);
    }
    console.log(
      green(
        `\n  FINAL ${claim.final?.outcome ?? '-'} payout=${claim.final?.payoutAmount ?? 0} decidedBy=${claim.final?.decidedBy ?? '-'} status=${claim.status}`,
      ),
    );

    const { events, verification } = await c.service.audit(reviewer, claim.claimId);
    console.log(bold(`\n  Audit trail (${events.length} events, hash chain valid=${verification.valid})`));
    for (const e of events) {
      console.log(
        dim(
          `   #${String(e.seq).padStart(2)} ${e.type.padEnd(22)} ${e.actor.padEnd(28)} ${e.hash.slice(0, 12)}`,
        ),
      );
    }
    const u = claim.usage;
    console.log(
      bold('\n  Usage ') +
        `steps=${u.iterations} llmCalls=${u.llmCalls} tokens=${u.inputTokens + u.outputTokens} toolCalls=${u.toolCalls} cost=$${u.costUsd.toFixed(6)}\n`,
    );
  } finally {
    await c.close();
  }
}

switch (command) {
  case 'demo': {
    const sc = loadGoldenSet().scenarios.find((s) => s.id === values.scenario);
    if (!sc) throw new Error(`unknown scenario ${values.scenario}`);
    await runClaim(sc.fnol, `${sc.id} ${sc.title}`);
    break;
  }
  case 'run': {
    if (!values.file) throw new Error('--file is required');
    await runClaim(JSON.parse(readFileSync(values.file, 'utf8')), values.file);
    break;
  }
  case 'graph':
    console.log(createClaimsGraph().toMermaid({ coverage: ['fraudRisk', 'decision'] }));
    break;
  case 'migrate': {
    const config = loadConfig();
    const { db, pool } = createDatabase(config.DATABASE_URL ?? '');
    await runMigrations(db);
    await pool.end();
    console.log('migrations applied');
    break;
  }
  default:
    console.error(`unknown command ${command}`);
    process.exit(2);
}
