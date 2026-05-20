export type PostgresStoreClient = {
  query(sql: string, params?: unknown[]): Promise<{ rows?: Array<Record<string, unknown>> }> | { rows?: Array<Record<string, unknown>> };
  close?: () => void | Promise<void>;
  end?: () => void | Promise<void>;
};

export type PostgresStoreOptions = {
  client: PostgresStoreClient;
  schema?: string;
  table?: string;
  namespace?: string;
  migrate?: boolean;
  close?: boolean | ((client: PostgresStoreClient) => void | Promise<void>);
};

export function postgresStore(options: PostgresStoreOptions): unknown;
export const postgresStoreCapabilities: {
  writable: true;
  persistence: 'postgres';
  atomicity: 'resource';
  liveEvents: true;
  staticExport: false;
  production: 'small-app';
};
