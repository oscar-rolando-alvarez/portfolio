/**
 * Standalone MCP tool server over stdio:  node apps/server/src/mcp-serve.ts <policy-lookup|claims-history|document-extract>
 * Used when MCP_TRANSPORT=stdio (one isolated process per tool server) and by external MCP clients.
 * stdout is reserved for the protocol; diagnostics go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { InMemoryVaultStorage, PiiCipher, TokenizingVault, type VaultStorage } from '@aco/core';
import { PgVaultStorage, createDatabase } from '@aco/infra';
import {
  createClaimsHistoryServer,
  createDocumentExtractServer,
  createPolicyLookupServer,
} from '@aco/mcp-tools';
import { loadConfig } from './config.ts';

async function main(): Promise<void> {
  const name = process.argv[2] ?? '';
  const config = loadConfig();
  let server;
  switch (name) {
    case 'policy-lookup':
      server = createPolicyLookupServer();
      break;
    case 'claims-history':
      server = createClaimsHistoryServer();
      break;
    case 'document-extract': {
      // Only this server receives vault (decryption) capability.
      let storage: VaultStorage;
      if (config.STORAGE === 'postgres') {
        storage = new PgVaultStorage(createDatabase(config.DATABASE_URL ?? '', { maxConnections: 2 }).db);
      } else {
        storage = new InMemoryVaultStorage();
      }
      const vault = new TokenizingVault(
        storage,
        new PiiCipher(config.piiEncryptionKey),
        config.piiTokenSecret,
      );
      server = createDocumentExtractServer((tenantId, ref) => vault.detokenize(tenantId, ref));
      break;
    }
    default:
      console.error(`unknown MCP server "${name}"`);
      process.exit(2);
  }
  await server.connect(new StdioServerTransport());
  console.error(`[mcp] ${name} listening on stdio`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
