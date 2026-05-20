export type KvStoreClient = {
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: string): unknown | Promise<unknown>;
  close?: () => void | Promise<void>;
  end?: () => void | Promise<void>;
  quit?: () => void | Promise<void>;
  disconnect?: () => void | Promise<void>;
};

export type KvStoreOptions = {
  client: KvStoreClient;
  prefix?: string;
  close?: boolean | ((client: KvStoreClient) => void | Promise<void>);
};

export function kvStore(options: KvStoreOptions): unknown;
export const kvStoreCapabilities: {
  writable: true;
  persistence: 'kv';
  atomicity: 'resource';
  liveEvents: true;
  staticExport: false;
  production: 'small-app';
};
