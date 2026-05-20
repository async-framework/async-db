import { dbError } from '../errors.js';
import {
  closeInjectedClient,
  createResourceWriteQueue,
  envelopeForResource,
  hydrateJsonResourceStore,
  parseJsonEnvelope,
} from '../features/storage/resource-json.js';

export const kvStoreCapabilities = {
  writable: true,
  persistence: 'kv',
  atomicity: 'resource',
  liveEvents: true,
  staticExport: false,
  production: 'small-app',
};

export function kvStore(options = {}) {
  const {
    client,
    prefix = 'async-db:',
    close = false,
  } = options;
  const withQueuedWrite = createResourceWriteQueue();

  return ({ config, storeName }) => {
    assertKvClient(client, storeName);

    function keyFor(resource) {
      return `${prefix}${encodeURIComponent(resource.name)}`;
    }

    async function readEnvelope(resource) {
      return parseJsonEnvelope(await client.get(keyFor(resource)), storeName);
    }

    async function writeEnvelope(resource, envelope) {
      await client.set(keyFor(resource), JSON.stringify(envelope));
    }

    return {
      name: storeName,
      capabilities: kvStoreCapabilities,
      async hydrate(resources) {
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
        await writeEnvelope(resource, envelopeForResource(resource, value));
      },
      withResourceWrite(resource, operation) {
        return withQueuedWrite(keyFor(resource), operation);
      },
      close() {
        return closeInjectedClient(client, close);
      },
    };
  };
}

export function redisStore(options = {}) {
  return kvStore(options);
}

export const redisStoreCapabilities = kvStoreCapabilities;

function assertKvClient(client, storeName) {
  if (client && typeof client.get === 'function' && typeof client.set === 'function') {
    return;
  }

  throw dbError(
    'KV_STORE_CLIENT_REQUIRED',
    `KV store "${storeName}" requires an injected client with get(key) and set(key, value).`,
    {
      status: 500,
      hint: 'Pass a Redis-like, edge KV, or compatible object to kvStore({ client }).',
      details: {
        store: storeName,
      },
    },
  );
}
