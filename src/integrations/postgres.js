import { dbError } from '../errors.js';
import {
  createResourceWriteQueue,
  hydrateJsonResourceStore,
  closeInjectedClient,
} from '../features/storage/resource-json.js';

export const postgresStoreCapabilities = {
  writable: true,
  persistence: 'postgres',
  atomicity: 'resource',
  liveEvents: true,
  staticExport: false,
  production: 'small-app',
};

export function postgresStore(options = {}) {
  const {
    client,
    schema = 'public',
    table = '_async_db_resources',
    namespace = 'default',
    migrate = true,
    close = false,
  } = options;
  const withQueuedWrite = createResourceWriteQueue();
  let migrated = false;

  return ({ config, storeName }) => {
    assertPostgresClient(client, storeName);
    const qualifiedTable = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

    async function ensureMigrated() {
      if (!migrate || migrated) {
        return;
      }

      if (schema !== 'public') {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);
      }
      await client.query(`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_hash TEXT,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (namespace, name)
)`);
      migrated = true;
    }

    async function readEnvelope(resource) {
      await ensureMigrated();
      const result = await client.query(
        `SELECT kind, source_hash, value FROM ${qualifiedTable} WHERE namespace = $1 AND name = $2`,
        [namespace, resource.name],
      );
      const row = result?.rows?.[0];
      if (!row) {
        return null;
      }
      return {
        kind: row.kind,
        sourceHash: row.source_hash ?? null,
        value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
      };
    }

    async function writeEnvelope(resource, envelope) {
      await ensureMigrated();
      await client.query(
        `INSERT INTO ${qualifiedTable} (namespace, name, kind, source_hash, value, updated_at)
VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
ON CONFLICT (namespace, name) DO UPDATE SET
  kind = EXCLUDED.kind,
  source_hash = EXCLUDED.source_hash,
  value = EXCLUDED.value,
  updated_at = CURRENT_TIMESTAMP`,
        [
          namespace,
          resource.name,
          envelope.kind,
          envelope.sourceHash ?? null,
          JSON.stringify(envelope.value),
        ],
      );
    }

    return {
      name: storeName,
      capabilities: postgresStoreCapabilities,
      async hydrate(resources) {
        await ensureMigrated();
        for (const resource of resources) {
          await hydrateJsonResourceStore({
            config,
            resource,
            readEnvelope,
            writeEnvelope,
          });
        }
      },
      async readResource(resource, fallback) {
        const envelope = await readEnvelope(resource);
        return envelope ? envelope.value : fallback;
      },
      async writeResource(resource, value) {
        await writeEnvelope(resource, {
          kind: resource.kind,
          sourceHash: resource.dataHash ?? null,
          value,
        });
      },
      withResourceWrite(resource, operation) {
        return withQueuedWrite(`${namespace}:${resource.name}`, operation);
      },
      close() {
        return closeInjectedClient(client, close);
      },
    };
  };
}

function assertPostgresClient(client, storeName) {
  if (client && typeof client.query === 'function') {
    return;
  }

  throw dbError(
    'POSTGRES_STORE_CLIENT_REQUIRED',
    `Postgres store "${storeName}" requires an injected client with query(sql, params).`,
    {
      status: 500,
      hint: 'Pass a pg Pool, pg Client, or compatible object to postgresStore({ client }).',
      details: {
        store: storeName,
      },
    },
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
