import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { syncDb, loadConfig } from '../../src/index.js';
import { makeProject, writeConfig, writeFixture } from '../helpers.js';

test('schemaOutFile writes a committed manifest without UI defaults or fixture changes', async () => {
  const cwd = await makeProject();
  const usersFixture = JSON.stringify([
    {
      id: 'u_1',
      email: 'ada@example.com',
      active: true,
      avatarUrl: 'https://example.com/ada.png',
      body: 'First local admin user.',
    },
  ]);
  await writeConfig(cwd, `export default {
    schemaOutFile: './src/generated/db.schema.json'
  };`);
  await writeFixture(cwd, 'users.json', usersFixture);

  const config = await loadConfig({ cwd });
  await syncDb(config);

  const manifest = JSON.parse(await readFile(path.join(cwd, 'src/generated/db.schema.json'), 'utf8'));
  const sourceAfterSync = await readFile(path.join(cwd, 'db/users.json'), 'utf8');

  assert.equal(sourceAfterSync, `${usersFixture}\n`);
  assert.equal(manifest.version, 1);
  assert.deepEqual(Object.keys(manifest.documents), []);
  assert.equal(manifest.collections.users.kind, 'collection');
  assert.equal(manifest.collections.users.name, 'users');
  assert.equal(manifest.collections.users.idField, 'id');
  assert.equal('ui' in manifest.collections.users.fields.id, false);
  assert.equal('ui' in manifest.collections.users.fields.email, false);
  assert.equal('ui' in manifest.collections.users.fields.active, false);
  assert.equal('ui' in manifest.collections.users.fields.avatarUrl, false);
  assert.equal('ui' in manifest.collections.users.fields.body, false);
  assert.equal(manifest.collections.users.fields.email.required, true);
  assert.equal('seed' in manifest.collections.users, false);
  assert.equal('source' in manifest.collections.users, false);
  assert.equal('diagnostics' in manifest, false);
  assert.equal('graphql' in manifest, false);
  assert.equal('rest' in manifest, false);
});

test('schema manifest includes schema defaults, nested fields, arrays, and relations without UI hints', async () => {
  const cwd = await makeProject();
  await writeConfig(cwd, `export default {
    schemaOutFile: './src/generated/db.schema.json'
  };`);
  await writeFixture(cwd, 'groups.schema.jsonc', `{
    "kind": "collection",
    "fields": {
      "id": { "type": "string", "required": true },
      "name": { "type": "string", "required": true }
    }
  }`);
  await writeFixture(cwd, 'users.schema.jsonc', `{
    "kind": "collection",
    "idField": "id",
    "fields": {
      "id": { "type": "string", "required": true },
      "role": { "type": "enum", "values": ["admin", "user"], "default": "user" },
      "status": { "type": "enum", "values": ["draft", "review", "published", "archived"] },
      "groupId": { "type": "string", "relation": { "to": "groups" } },
      "tags": { "type": "array", "items": { "type": "string" } },
      "profile": {
        "type": "object",
        "fields": {
          "bio": { "type": "string" }
        }
      }
    }
  }`);

  const config = await loadConfig({ cwd });
  await syncDb(config);

  const manifest = JSON.parse(await readFile(path.join(cwd, 'src/generated/db.schema.json'), 'utf8'));
  const users = manifest.collections.users;

  assert.equal(users.fields.role.default, 'user');
  assert.deepEqual(users.fields.role.values, ['admin', 'user']);
  assert.equal('ui' in users.fields.role, false);
  assert.equal('ui' in users.fields.status, false);
  assert.equal(users.fields.groupId.relation.to, 'groups');
  assert.equal('ui' in users.fields.groupId, false);
  assert.equal(users.fields.tags.items.type, 'string');
  assert.equal('ui' in users.fields.tags, false);
  assert.equal(users.fields.profile.fields.bio.type, 'string');
  assert.equal('ui' in users.fields.profile, false);
});

test('schema manifest customizeField can attach app-owned metadata and omit field output', async () => {
  const cwd = await makeProject();
  await writeConfig(cwd, `export default {
    schemaOutFile: './src/generated/db.schema.json',
    schemaManifest: {
      customizeField({ fieldName, resourceName, path, file, defaultManifest }) {
        if (fieldName === 'secret') {
          return null;
        }

        if (resourceName === 'users' && fieldName.endsWith('Markdown')) {
          return {
            ...defaultManifest,
            schemaUi: {
              component: 'markdown',
              section: \`\${file}:\${path}\`
            }
          };
        }

        return defaultManifest;
      }
    }
  };`);
  await writeFixture(cwd, 'users.json', JSON.stringify([
    {
      id: 'u_1',
      bioMarkdown: '# Ada',
      secret: 'hidden',
    },
  ]));

  const config = await loadConfig({ cwd });
  await syncDb(config);

  const manifest = JSON.parse(await readFile(path.join(cwd, 'src/generated/db.schema.json'), 'utf8'));

  assert.equal(manifest.collections.users.fields.bioMarkdown.schemaUi.component, 'markdown');
  assert.equal(manifest.collections.users.fields.bioMarkdown.schemaUi.section, 'db/users.json:bioMarkdown');
  assert.equal('secret' in manifest.collections.users.fields, false);
});

test('schema manifest customizeField can attach app-owned metadata to object fields inside arrays', async () => {
  const cwd = await makeProject();
  await writeConfig(cwd, `export default {
    schemaOutFile: './src/generated/db.schema.json',
    schemaManifest: {
      customizeField({ resourceName, fieldName, path, file, defaultManifest }) {
        if (resourceName !== 'pages') {
          return defaultManifest;
        }

        if (path === 'blocks') {
          return {
            ...defaultManifest,
            schemaUi: {
              component: 'block-list',
              source: file
            }
          };
        }

        if (fieldName === 'type') {
          return {
            ...defaultManifest,
            values: ['chart', 'metric'],
            schemaUi: {
              component: 'select',
              label: 'Block type',
              orderKey: path
            }
          };
        }

        if (fieldName === 'chartId') {
          return {
            ...defaultManifest,
            schemaUi: {
              component: 'relation-select',
              relationTo: 'charts',
              source: file
            }
          };
        }

        return defaultManifest;
      }
    }
  };`);
  await mkdir(path.join(cwd, 'db/cms'), { recursive: true });
  await writeFile(path.join(cwd, 'db/cms/pages.schema.jsonc'), `{
    "kind": "collection",
    "fields": {
      "id": { "type": "string", "required": true },
      "blocks": {
        "type": "array",
        "items": {
          "type": "object",
          "fields": {
            "type": { "type": "string", "required": true },
            "chartId": { "type": "string" }
          }
        }
      }
    }
  }\n`, 'utf8');

  const config = await loadConfig({ cwd });
  await syncDb(config);

  const manifest = JSON.parse(await readFile(path.join(cwd, 'src/generated/db.schema.json'), 'utf8'));
  const blocks = manifest.collections.pages.fields.blocks;

  assert.equal(blocks.schemaUi.component, 'block-list');
  assert.equal(blocks.schemaUi.source, 'db/cms/pages.schema.jsonc');
  assert.equal(blocks.items.fields.type.values[0], 'chart');
  assert.equal(blocks.items.fields.type.schemaUi.component, 'select');
  assert.equal(blocks.items.fields.type.schemaUi.label, 'Block type');
  assert.equal(blocks.items.fields.type.schemaUi.orderKey, 'blocks.type');
  assert.equal(blocks.items.fields.chartId.schemaUi.component, 'relation-select');
  assert.equal(blocks.items.fields.chartId.schemaUi.relationTo, 'charts');
  assert.equal(blocks.items.fields.chartId.schemaUi.source, 'db/cms/pages.schema.jsonc');
});

test('schema manifest customizeResource can add resource-level metadata', async () => {
  const cwd = await makeProject();
  await writeConfig(cwd, `export default {
    schemaOutFile: './src/generated/db.schema.json',
    schemaManifest: {
      customizeResource({ resourceName, file, defaultManifest }) {
        return {
          ...defaultManifest,
          schemaUi: {
            group: file.startsWith('db/cms/') ? 'CMS' : 'Data',
            label: resourceName
          }
        };
      }
    }
  };`);
  await mkdir(path.join(cwd, 'db/cms'), { recursive: true });
  await writeFile(path.join(cwd, 'db/cms/pages.schema.jsonc'), `{
    "kind": "collection",
    "fields": {
      "id": { "type": "string", "required": true }
    }
  }\n`, 'utf8');

  const config = await loadConfig({ cwd });
  await syncDb(config);

  const manifest = JSON.parse(await readFile(path.join(cwd, 'src/generated/db.schema.json'), 'utf8'));

  assert.deepEqual(manifest.collections.pages.schemaUi, {
    group: 'CMS',
    label: 'pages',
  });
});

test('schema manifest rejects non-serializable customizeField output with diagnostics', async () => {
  const cwd = await makeProject();
  await writeConfig(cwd, `export default {
    schemaOutFile: './src/generated/db.schema.json',
    schemaManifest: {
      customizeField({ defaultManifest }) {
        return {
          ...defaultManifest,
          schemaUi: {
            render: () => 'nope'
          }
        };
      }
    }
  };`);
  await writeFixture(cwd, 'users.json', JSON.stringify([{ id: 'u_1', name: 'Ada' }]));

  const config = await loadConfig({ cwd });

  await assert.rejects(
    () => syncDb(config),
    (error) => {
      assert.equal(error.diagnostics?.[0]?.code, 'SCHEMA_MANIFEST_FIELD_NOT_SERIALIZABLE');
      assert.match(error.diagnostics[0].message, /users\.id/);
      assert.match(error.diagnostics[0].hint, /JSON-serializable/);
      return true;
    },
  );
});
