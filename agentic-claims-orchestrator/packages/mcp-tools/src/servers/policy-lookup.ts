import { McpServer } from '@modelcontextprotocol/server';
import { PolicyLookupInput, PolicyLookupOutput, toolContracts, type PolicyRecord } from '@aco/core';
import { POLICIES } from '../data/policies.ts';
import { SERVER_VERSION, structuredResult } from './common.ts';
import { traced } from './tracing.ts';

export function createPolicyLookupServer(policies: readonly PolicyRecord[] = POLICIES): McpServer {
  const byNumber = new Map(policies.map((p) => [p.policyNumber, p]));
  const server = new McpServer({ name: 'policy-lookup', version: SERVER_VERSION });
  server.registerTool(
    'policy_lookup',
    {
      title: 'Policy lookup',
      description: toolContracts.policy_lookup.description,
      inputSchema: PolicyLookupInput,
      outputSchema: PolicyLookupOutput,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      traced('policy_lookup', ctx.mcpReq._meta, () => {
        const policy = byNumber.get(args.policyNumber) ?? null;
        return structuredResult({ found: policy !== null, policy });
      }),
  );
  return server;
}
