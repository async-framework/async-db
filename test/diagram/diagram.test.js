import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDiagramModel, renderMermaidDiagram } from '../../src/diagram.js';
import { loadConfig } from '../../src/index.js';
import { loadProjectSchema } from '../../src/schema.js';
import { makeProject, writeConfig, writeFixture } from '../helpers.js';

test('diagram model includes resources, filtered fields, relations, and no seed or source data', async () => {
  const cwd = await makeProject();
  await writeConfig(cwd, `export default {
    schemaManifest: {
      customizeField({ fieldName, defaultManifest }) {
        if (fieldName === 'secret') {
          return null;
        }
        return defaultManifest;
      }
    }
  };`);
  await writeFixture(cwd, 'groups.schema.jsonc', `{
    "kind": "collection",
    "idField": "id",
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
      "email": { "type": "string", "required": true, "unique": true },
      "groupId": {
        "type": "string",
        "required": true,
        "relation": { "name": "group", "to": "groups", "toField": "id", "cardinality": "one" }
      },
      "secret": { "type": "string" }
    }
  }`);
  await writeFixture(cwd, 'users.json', JSON.stringify([{ id: 'u_1', email: 'ada@example.com', groupId: 'g_1', secret: 'do-not-leak' }]));
  await writeFixture(cwd, 'settings.schema.jsonc', `{
    "kind": "document",
    "fields": {
      "theme": { "type": "string", "default": "light" }
    }
  }`);

  const config = await loadConfig({ cwd });
  const project = await loadProjectSchema(config);
  const model = renderDiagramModel(project.resources, config, { fields: 'all' });

  assert.equal(model.kind, 'db.diagramModel');
  assert.equal(model.version, 1);
  assert.deepEqual(model.resources.map((resource) => resource.name), ['groups', 'settings', 'users']);
  assert.deepEqual(model.resources.find((resource) => resource.name === 'users').fields.map((field) => field.name), ['id', 'email', 'groupId']);
  assert.deepEqual(model.resources.find((resource) => resource.name === 'settings').fields.map((field) => field.name), ['theme']);
  assert.deepEqual(model.relations, [{
    name: 'group',
    sourceResource: 'users',
    sourceField: 'groupId',
    targetResource: 'groups',
    targetField: 'id',
    cardinality: 'one',
    required: true,
  }]);

  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /ada@example\.com/);
  assert.doesNotMatch(serialized, /do-not-leak/);
  assert.doesNotMatch(serialized, /schema\.jsonc/);
  assert.doesNotMatch(serialized, /\.db/);
  assert.doesNotMatch(serialized, /graphql/i);
});

test('diagram model field modes are deterministic', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'teams.schema.jsonc', `{
    "kind": "collection",
    "idField": "id",
    "fields": {
      "id": { "type": "string", "required": true },
      "label": { "type": "string" }
    }
  }`);
  await writeFixture(cwd, 'tasks.schema.jsonc', `{
    "kind": "collection",
    "idField": "id",
    "fields": {
      "title": { "type": "string" },
      "teamId": { "type": "string", "relation": { "name": "team", "to": "teams" } },
      "id": { "type": "string", "required": true }
    }
  }`);

  const config = await loadConfig({ cwd });
  const project = await loadProjectSchema(config);
  const compact = renderDiagramModel(project.resources, config, { fields: 'compact' });
  const none = renderDiagramModel(project.resources, config, { fields: 'none' });

  assert.deepEqual(compact.resources.find((resource) => resource.name === 'tasks').fields.map((field) => field.name), ['id', 'teamId']);
  assert.deepEqual(compact.resources.find((resource) => resource.name === 'teams').fields.map((field) => field.name), ['id']);
  assert.deepEqual(none.resources.find((resource) => resource.name === 'tasks').fields, []);
  assert.deepEqual(none.resources.find((resource) => resource.name === 'teams').fields, []);
  assert.equal(JSON.stringify(compact), JSON.stringify(renderDiagramModel(project.resources, config, { fields: 'compact' })));
});

test('mermaid diagram renders ER resources, aliases, attributes, and relation cardinality', () => {
  const model = {
    kind: 'db.diagramModel',
    version: 1,
    resources: [
      {
        name: 'groups',
        kind: 'collection',
        typeName: 'Group',
        idField: 'id',
        fields: [
          { name: 'id', type: 'string', required: true, key: 'PK' },
        ],
      },
      {
        name: 'users',
        kind: 'collection',
        typeName: 'User',
        idField: 'id',
        fields: [
          { name: 'id', type: 'string', required: true, key: 'PK' },
          { name: 'groupId', type: 'string', required: true, key: 'FK' },
        ],
      },
    ],
    relations: [
      {
        name: 'group',
        sourceResource: 'users',
        sourceField: 'groupId',
        targetResource: 'groups',
        targetField: 'id',
        cardinality: 'one',
        required: true,
      },
    ],
  };

  const mermaid = renderMermaidDiagram(model);

  assert.match(mermaid, /^erDiagram\n/);
  assert.match(mermaid, /groups\["groups"\] \{/);
  assert.match(mermaid, /string id PK/);
  assert.match(mermaid, /users \}o--\|\| groups : "group"/);
  assert.equal(mermaid.endsWith('\n'), true);
});
