import { dbError } from '../../errors.js';
import { applyDefaultsToSeed } from '../sync/defaults.js';
import { seedForRuntimeState } from '../sync/synthetic-seed.js';

export function createResourceWriteQueue() {
  const queues = new Map();
  return function withQueuedResourceWrite(queueKey, operation) {
    const previous = queues.get(queueKey) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    const stored = current.catch(() => {});
    queues.set(queueKey, stored);
    stored.finally(() => {
      if (queues.get(queueKey) === stored) {
        queues.delete(queueKey);
      }
    });
    return current;
  };
}

export async function hydrateJsonResourceStore({ config, resource, readEnvelope, writeEnvelope }) {
  const envelope = await readEnvelope(resource);
  const sourceChanged = resource.dataHash && envelope?.sourceHash !== resource.dataHash;

  if (!envelope || sourceChanged) {
    await writeEnvelope(resource, {
      kind: resource.kind,
      sourceHash: resource.dataHash ?? null,
      value: applyDefaultsToSeed(seedForRuntimeState(resource, config), resource, config),
    });
    return;
  }

  if (config.defaults?.applyOnSafeMigration !== false) {
    await writeEnvelope(resource, {
      kind: resource.kind,
      sourceHash: resource.dataHash ?? envelope.sourceHash ?? null,
      value: applyDefaultsToSeed(envelope.value, resource, config),
    });
  }
}

export function envelopeForResource(resource, value) {
  return {
    kind: resource.kind,
    sourceHash: resource.dataHash ?? null,
    value,
  };
}

export function parseJsonEnvelope(raw, storeName) {
  if (raw === undefined || raw === null) {
    return null;
  }

  const envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!envelope || typeof envelope !== 'object' || !('value' in envelope)) {
    throw dbError(
      'STORE_INVALID_RESOURCE_ENVELOPE',
      `Store "${storeName}" returned an invalid resource envelope.`,
      {
        status: 500,
        hint: 'Resource JSON stores must persist { kind, sourceHash, value } envelopes.',
        details: {
          store: storeName,
        },
      },
    );
  }
  return envelope;
}

export async function closeInjectedClient(client, closeOption) {
  if (!closeOption) {
    return;
  }

  if (typeof closeOption === 'function') {
    await closeOption(client);
    return;
  }

  for (const method of ['close', 'end', 'quit', 'disconnect']) {
    if (typeof client?.[method] === 'function') {
      await client[method]();
      return;
    }
  }
}
