import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server';
import type { PiiVault, ToolName } from '@aco/core';
import { McpToolGateway } from './gateway.ts';
import { createClaimsHistoryServer } from './servers/claims-history.ts';
import { createDocumentExtractServer } from './servers/document-extract.ts';
import { createPolicyLookupServer } from './servers/policy-lookup.ts';

export const TOOL_SERVERS: Readonly<Record<ToolName, string>> = {
  policy_lookup: 'policy-lookup',
  claims_history: 'claims-history',
  document_extract: 'document-extract',
};

export interface ToolRuntime {
  gateway: McpToolGateway;
  close(): Promise<void>;
}

const CLIENT_INFO = { name: 'claims-orchestrator', version: '0.1.0' };

/** Builds the three MCP servers. document-extract is the only one given vault read access. */
export function createToolServers(vault: PiiVault): Record<ToolName, McpServer> {
  return {
    policy_lookup: createPolicyLookupServer(),
    claims_history: createClaimsHistoryServer(),
    document_extract: createDocumentExtractServer((tenantId, ref) => vault.detokenize(tenantId, ref)),
  };
}

/** Same MCP protocol, in-process transport: zero network hops for the single-binary deployment. */
export async function connectInProcess(
  vault: PiiVault,
  opts: { timeoutMs?: number } = {},
): Promise<ToolRuntime> {
  const servers = createToolServers(vault);
  const clients = {} as Record<ToolName, Client>;
  for (const [tool, server] of Object.entries(servers) as [ToolName, McpServer][]) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client(CLIENT_INFO);
    await client.connect(clientTransport);
    clients[tool] = client;
  }
  return {
    gateway: new McpToolGateway(clients, vault, opts),
    close: async () => {
      await Promise.allSettled(Object.values(clients).map((c) => c.close()));
      await Promise.allSettled(Object.values(servers).map((s) => s.close()));
    },
  };
}

/** Out-of-process MCP servers over stdio (one process per tool server, isolated credentials). */
export async function connectStdio(
  vault: PiiVault,
  spawn: (server: string) => { command: string; args: string[]; env?: Record<string, string> },
  opts: { timeoutMs?: number } = {},
): Promise<ToolRuntime> {
  const clients = {} as Record<ToolName, Client>;
  for (const [tool, server] of Object.entries(TOOL_SERVERS) as [ToolName, string][]) {
    const params = spawn(server);
    const transport = new StdioClientTransport({
      command: params.command,
      args: params.args,
      ...(params.env ? { env: params.env } : {}),
      stderr: 'inherit',
    });
    const client = new Client(CLIENT_INFO);
    await client.connect(transport);
    clients[tool] = client;
  }
  return {
    gateway: new McpToolGateway(clients, vault, opts),
    close: async () => {
      await Promise.allSettled(Object.values(clients).map((c) => c.close()));
    },
  };
}
