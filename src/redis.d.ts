import type { KvStoreClient, KvStoreOptions } from './kv.d.ts';

export type RedisStoreClient = KvStoreClient;
export type RedisStoreOptions = KvStoreOptions;

export function redisStore(options: RedisStoreOptions): unknown;
export const redisStoreCapabilities: {
  writable: true;
  persistence: 'kv';
  atomicity: 'resource';
  liveEvents: true;
  staticExport: false;
  production: 'small-app';
};
