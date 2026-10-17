import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DomainError,
  InMemoryVaultStorage,
  PiiCipher,
  TokenizingVault,
  TransientError,
  type ToolName,
} from '@aco/core';
import { McpToolGateway, connectInProcess, extractFields, type ToolRuntime } from '@aco/mcp-tools';

const vault = new TokenizingVault(
  new InMemoryVaultStorage(),
  new PiiCipher(randomBytes(32).toString('base64')),
  'test-secret',
);
let runtime: ToolRuntime;

beforeAll(async () => {
  runtime = await connectInProcess(vault);
});
afterAll(async () => {
  await runtime.close();
});

describe('MCP tool servers via the governed gateway', () => {
  it('advertises every contracted tool with an output schema', async () => {
    expect(await runtime.gateway.verify()).toEqual([
      { tool: 'policy_lookup', ok: true },
      { tool: 'claims_history', ok: true },
      { tool: 'document_extract', ok: true },
    ]);
  });

  it('looks up policies', async () => {
    const res = await runtime.gateway.call('policy_lookup', { policyNumber: 'POL-100004' });
    expect(res).toMatchObject({ found: true, policy: { lineOfBusiness: 'property', deductible: 1_000 } });
    expect(await runtime.gateway.call('policy_lookup', { policyNumber: 'POL-000000' })).toEqual({
      found: false,
      policy: null,
    });
  });

  it('returns point-in-time claims history', async () => {
    const res = await runtime.gateway.call('claims_history', {
      policyNumber: 'POL-100006',
      asOf: '2026-10-01',
    });
    expect(res.claimsLast24Months).toBe(5);
    const earlier = await runtime.gateway.call('claims_history', {
      policyNumber: 'POL-100006',
      asOf: '2025-07-01',
    });
    expect(earlier.claimsLast24Months).toBe(2);
  });

  it('validates input against the Zod contract before calling the server', async () => {
    await expect(runtime.gateway.call('policy_lookup', { policyNumber: 'DROP TABLE' })).rejects.toMatchObject(
      { code: 'VALIDATION_FAILED' },
    );
  });

  it('extracts documents and tokenizes PII before agents see it', async () => {
    const content =
      'Estimate No: EST-12345\nDate: 2026-10-02\nCustomer: Maria Lopez\nPhone: 555-201-3344\nEmail: m@example.com\nEstimate Total: $3,850.00';
    const contentRef = await vault.tokenize('acme', 'document', content);
    const out = await runtime.gateway.call('document_extract', {
      tenantId: 'acme',
      documentId: 'd1',
      kind: 'repair_estimate',
      contentRef,
    });
    expect(out).toMatchObject({ totalAmount: 3850, documentDate: '2026-10-02', reference: 'EST-12345' });
    expect(out.piiTokens).toHaveLength(3);
    expect(JSON.stringify(out)).not.toContain('Maria');
    expect(await vault.detokenize('acme', out.piiTokens[0] ?? '')).toBe('Maria Lopez');
  });

  it('maps tool errors to non-retryable domain errors', async () => {
    const missing = await vault.tokenize('other-tenant', 'document', 'x');
    await expect(
      runtime.gateway.call('document_extract', {
        tenantId: 'acme',
        documentId: 'd2',
        kind: 'invoice',
        contentRef: missing,
      }),
    ).rejects.toMatchObject({ code: 'TOOL_FAILED', retryable: false });
  });

  it('rejects servers that violate their output contract', async () => {
    const rogue = new McpServer({ name: 'rogue', version: '1.0.0' });
    rogue.registerTool(
      'policy_lookup',
      { inputSchema: z.object({ policyNumber: z.string() }), outputSchema: z.object({ found: z.string() }) },
      () => ({ content: [], structuredContent: { found: 'yes' } }),
    );
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await rogue.connect(st);
    const client = new Client({ name: 't', version: '1' });
    await client.connect(ct);
    const gw = new McpToolGateway({ policy_lookup: client } as Record<ToolName, Client>, vault);
    await expect(gw.call('policy_lookup', { policyNumber: 'POL-100001' })).rejects.toBeInstanceOf(
      DomainError,
    );
    await client.close();
  });

  it('treats transport failures as transient', async () => {
    // client never connected: every call fails at the transport layer
    const client = new Client({ name: 't', version: '1' });
    const gw = new McpToolGateway({ policy_lookup: client } as Record<ToolName, Client>, vault, {
      timeoutMs: 50,
    });
    await expect(gw.call('policy_lookup', { policyNumber: 'POL-100001' })).rejects.toBeInstanceOf(
      TransientError,
    );
  });
});

describe('document field extraction', () => {
  it('parses totals, dates, references and PII entities', () => {
    const f = extractFields(
      'Invoice Number: INV-77812\nDate: 2026-09-01\nCustomer: Ann Lee\nAmount Due: USD 1,234.50',
    );
    expect(f).toMatchObject({
      totalAmount: 1234.5,
      documentDate: '2026-09-01',
      reference: 'INV-77812',
      pii: { names: ['Ann Lee'] },
    });
    expect(extractFields('nothing here')).toMatchObject({
      totalAmount: null,
      documentDate: null,
      reference: null,
    });
  });
});

describe('stdio transport', () => {
  it('serves policy_lookup from a separate process over stdio', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../../src/mcp-serve.ts', import.meta.url)), 'policy-lookup'],
      env: { ...(process.env as Record<string, string>), STORAGE: 'memory', MCP_TRANSPORT: 'in-process' },
      stderr: 'ignore',
    });
    const client = new Client({ name: 'stdio-test', version: '1' });
    await client.connect(transport);
    const gw = new McpToolGateway({ policy_lookup: client } as Record<ToolName, Client>, vault);
    expect(await gw.call('policy_lookup', { policyNumber: 'POL-100009' })).toMatchObject({ found: true });
    await client.close();
  });
});
