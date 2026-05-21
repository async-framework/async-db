// @ts-check
import { defineConfig } from '@async/db/config';
import { dashboardCsvReader } from './src/dashboard-csv-reader.mjs';

export default defineConfig({
  dbDir: './db',
  outputs: {
    stateDir: './.db',
    types: './.db/types/index.ts',
  },
  types: {
    enabled: true,
  },
  sources: {
    readers: [dashboardCsvReader],
  },
});
