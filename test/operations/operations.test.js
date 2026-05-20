import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildOperationManifest, hashOperation, loadConfig } from '../../src/index.js';
import { operationRequest } from '../../src/operations.js';
import { makeProject } from '../helpers.js';

test('operation strings and JSON templates canonicalize to the same stable hash', () => {
  const stringHash = hashOperation('/users/{id}.json?select=id,name');
  const objectHash = hashOperation({
    method: 'GET',
    path: '/users/{id}.json',
    query: {
      select: 'id,name',
    },
  });

  assert.match(stringHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(stringHash, objectHash);
});

test('operation manifest build emits full server registry and client-safe refs', async () => {
  const cwd = await makeProject();
  await mkdir(path.join(cwd, 'db/operations'), { recursive: true });
  await writeFile(path.join(cwd, 'db/operations/get-user.jsonc'), `{
    "name": "GetUser",
    "method": "GET",
    "path": "/users/{id}.json",
    "query": {
      "select": "id,name"
    }
  }`, 'utf8');

  const config = await loadConfig({
    cwd,
    operations: {
      sourceDir: './db/operations',
      outFile: './src/generated/db.operations.json',
      refsOutFile: './src/generated/db.operation-refs.json',
    },
  });
  const result = await buildOperationManifest(config, {
    generatedAt: '2026-05-20T00:00:00.000Z',
  });

  const [hash] = Object.keys(result.manifest.operations);
  assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.refs.operations.GetUser, {
    name: 'GetUser',
    hash,
  });
  assert.equal(result.refs.operations.GetUser.path, undefined);
  assert.equal(result.refs.operations.GetUser.query, undefined);
  assert.equal(result.manifest.operations[hash].path, '/users/{id}.json');
  assert.equal(result.manifest.operations[hash].query.select, 'id,name');
  assert.equal(JSON.parse(await readFile(path.join(cwd, 'src/generated/db.operations.json'), 'utf8')).operations[hash].name, 'GetUser');
  assert.equal(JSON.parse(await readFile(path.join(cwd, 'src/generated/db.operation-refs.json'), 'utf8')).operations.GetUser.hash, hash);
});

test('operation requests validate variables and encode path and query values', () => {
  assert.throws(
    () => operationRequest('/users/{id}.json?select=id,name', {}),
    (error) => error.code === 'OPERATION_VARIABLE_MISSING'
      && error.details.missing.includes('id'),
  );

  assert.throws(
    () => operationRequest('/users/{id}.json?select=id,name', { id: 'u_1', extra: 'nope' }),
    (error) => error.code === 'OPERATION_VARIABLE_UNKNOWN'
      && error.details.extra.includes('extra'),
  );

  const request = operationRequest('/users/{id}.json?filter={filter}&select=id,name', {
    id: 'u 1/../admin',
    filter: 'email=a+b@example.com&role=admin',
  });

  assert.equal(request.method, 'GET');
  assert.equal(request.path, '/users/u%201%2F..%2Fadmin.json?filter=email%3Da%2Bb%40example.com%26role%3Dadmin&select=id,name');
});
