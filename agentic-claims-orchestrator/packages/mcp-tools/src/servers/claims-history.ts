import { McpServer } from '@modelcontextprotocol/server';
import { ClaimsHistoryInput, ClaimsHistoryOutput, daysBetween, toolContracts } from '@aco/core';
import { CLAIMS_HISTORY } from '../data/claims-history.ts';
import { SERVER_VERSION, structuredResult } from './common.ts';
import { traced } from './tracing.ts';

const WINDOW_DAYS = 730;

export function createClaimsHistoryServer(history = CLAIMS_HISTORY): McpServer {
  const server = new McpServer({ name: 'claims-history', version: SERVER_VERSION });
  server.registerTool(
    'claims_history',
    {
      title: 'Claims history',
      description: toolContracts.claims_history.description,
      inputSchema: ClaimsHistoryInput,
      outputSchema: ClaimsHistoryOutput,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      traced('claims_history', ctx.mcpReq._meta, () => {
        // Only claims strictly before the as-of date are "prior" (point-in-time correctness).
        const prior = (history[args.policyNumber] ?? []).filter((c) => c.lossDate < args.asOf);
        const recent = prior.filter((c) => daysBetween(c.lossDate, args.asOf) <= WINDOW_DAYS);
        return structuredResult({
          policyNumber: args.policyNumber,
          priorClaims: [...prior],
          claimsLast24Months: recent.length,
          totalPaidLast24Months: recent.reduce((sum, c) => sum + c.paidAmount, 0),
        });
      }),
  );
  return server;
}
