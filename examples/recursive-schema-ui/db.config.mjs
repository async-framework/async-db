// @ts-check
import { defineConfig, mergeManifest } from '@async/db/config';

export default defineConfig({
  dbDir: './db',
  outputs: {
    stateDir: './.db',
    types: './.db/types/index.ts',
    committedTypes: './src/generated/db.types.ts',
    schemaManifest: './src/generated/db.schema.json',
  },
  types: {
    enabled: true,
    emitComments: true,
  },
  schemaManifest: {
    customizeResource({ resourceName, defaultManifest }) {
      if (resourceName === 'pages') {
        return mergeManifest(defaultManifest, {
          schemaUi: {
            title: 'Pages',
            description: 'CMS pages edited from generated schema metadata.',
            listLabelField: 'title',
          },
        });
      }

      if (resourceName === 'users') {
        return mergeManifest(defaultManifest, {
          schemaUi: {
            hidden: true,
            title: 'Authors',
            listLabelField: 'name',
          },
        });
      }

      return defaultManifest;
    },

    customizeField({ resourceName, fieldName, path, defaultManifest }) {
      if (resourceName !== 'pages') {
        return defaultManifest;
      }

      if (fieldName === 'bodyMarkdown') {
        return mergeManifest(defaultManifest, {
          schemaUi: {
            label: path === 'bodyMarkdown' ? 'Body' : 'Block body',
            component: 'markdown',
          },
        });
      }

      if (fieldName === 'status') {
        return mergeManifest(defaultManifest, {
          schemaUi: {
            component: 'segmented-control',
          },
        });
      }

      if (path === 'blocks') {
        return mergeManifest(defaultManifest, {
          schemaUi: {
            component: 'object-array',
            label: 'Content blocks',
          },
        });
      }

      if (path.endsWith('.settings.color')) {
        return mergeManifest(defaultManifest, {
          schemaUi: {
            label: 'Accent color',
          },
        });
      }

      return defaultManifest;
    },
  },
});
