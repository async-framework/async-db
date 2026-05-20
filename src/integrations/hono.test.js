import assert from 'node:assert/strict';
import test from 'node:test';
import { dbContext, registerDbRoutes } from './hono.js';
import { openDb } from '../index.js';
import { makeProject, writeFixture } from '../../test/helpers.js';

test('dbContext reuses the opened db when created from options', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'users.json', JSON.stringify([{ id: 'u_1', name: 'Ada' }]));
  const middleware = dbContext({ cwd });
  const first = fakeContext();
  const second = fakeContext();
  let nextCalls = 0;

  await middleware(first, async () => {
    nextCalls += 1;
  });
  await middleware(second, async () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 2);
  assert.equal(first.get('db'), second.get('db'));
});

test('registerDbRoutes supports prefix resource filters and hook short-circuiting', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([{ id: 'home', title: 'Home' }]));
  await writeFixture(cwd, 'users.json', JSON.stringify([{ id: 'u_1', name: 'Ada' }]));
  const db = await openDb({ cwd });
  const app = fakeHonoApp();

  registerDbRoutes(app, db, {
    prefix: '/api',
    resources: ['pages'],
    hooks: {
      beforeList(ctx) {
        assert.equal(ctx.resourceName, 'pages');
        assert.equal(ctx.method, 'list');
        return ctx.c.json({ error: 'Forbidden' }, 403);
      },
    },
  });

  assert.equal(Boolean(app.route('GET', '/api/pages')), true);
  assert.equal(Boolean(app.route('GET', '/api/users')), false);

  const response = await app.route('GET', '/api/pages').handler(fakeHonoContext());

  assert.deepEqual(response, {
    status: 403,
    body: {
      error: 'Forbidden',
    },
  });
});

test('registerDbRoutes supports resource hooks that mutate write bodies', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([]));
  const db = await openDb({ cwd });
  const app = fakeHonoApp();

  registerDbRoutes(app, db, {
    prefix: '/api',
    resourceOptions: {
      pages: {
        hooks: {
          beforeCreate(ctx) {
            ctx.body.title = ctx.body.title.trim();
          },
        },
      },
    },
  });

  const response = await app.route('POST', '/api/pages').handler(fakeHonoContext({
    body: {
      id: 'home',
      title: '  Home  ',
    },
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(await db.collection('pages').get('home'), {
    id: 'home',
    title: 'Home',
  });
});

test('registerDbRoutes runs lifecycle hooks before global and resource hooks', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([]));
  const db = await openDb({ cwd });
  const app = fakeHonoApp();
  const calls = [];

  registerDbRoutes(app, db, {
    prefix: '/api',
    lifecycleHooks: {
      beforeRequest(ctx) {
        calls.push(`request:${ctx.method}`);
      },
      beforeWrite(ctx) {
        calls.push(`write:${ctx.method}`);
        ctx.body.title = ctx.body.title.trim();
        ctx.body.updatedAt = '2026-05-14T00:00:00.000Z';
      },
    },
    hooks: {
      beforeCreate(ctx) {
        calls.push(`global:${ctx.method}`);
        ctx.body.fromGlobalHook = true;
      },
    },
    resourceOptions: {
      pages: {
        hooks: {
          beforeCreate(ctx) {
            calls.push(`resource:${ctx.method}`);
            ctx.body.fromResourceHook = true;
          },
        },
      },
    },
  });

  const response = await app.route('POST', '/api/pages').handler(fakeHonoContext({
    body: {
      id: 'home',
      title: '  Home  ',
    },
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [
    'request:create',
    'write:create',
    'global:create',
    'resource:create',
  ]);
  assert.deepEqual(await db.collection('pages').get('home'), {
    id: 'home',
    title: 'Home',
    updatedAt: '2026-05-14T00:00:00.000Z',
    fromGlobalHook: true,
    fromResourceHook: true,
  });
});

test('registerDbRoutes only runs beforeWrite for mutating methods', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([{ id: 'home', title: 'Home' }]));
  const db = await openDb({ cwd });
  const app = fakeHonoApp();
  const calls = [];

  registerDbRoutes(app, db, {
    prefix: '/api',
    lifecycleHooks: {
      beforeRequest(ctx) {
        calls.push(`request:${ctx.method}`);
      },
      beforeWrite(ctx) {
        calls.push(`write:${ctx.method}`);
      },
    },
  });

  await app.route('GET', '/api/pages').handler(fakeHonoContext());
  await app.route('GET', '/api/pages/:id').handler(fakeHonoContext({
    params: {
      id: 'home',
    },
  }));
  await app.route('PATCH', '/api/pages/:id').handler(fakeHonoContext({
    params: {
      id: 'home',
    },
    body: {
      title: 'Homepage',
    },
  }));

  assert.deepEqual(calls, [
    'request:list',
    'request:get',
    'request:patch',
    'write:patch',
  ]);
});

test('registerDbRoutes supports beforeRequest short-circuiting', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([]));
  const db = await openDb({ cwd });
  const app = fakeHonoApp();
  let methodHookCalled = false;

  registerDbRoutes(app, db, {
    prefix: '/api',
    lifecycleHooks: {
      beforeRequest(ctx) {
        return ctx.c.json({ error: 'Unauthorized' }, 401);
      },
    },
    hooks: {
      beforeCreate() {
        methodHookCalled = true;
      },
    },
  });

  const response = await app.route('POST', '/api/pages').handler(fakeHonoContext({
    body: {
      id: 'home',
      title: 'Home',
    },
  }));

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Unauthorized' });
  assert.equal(methodHookCalled, false);
  assert.equal(await db.collection('pages').exists('home'), false);
});

test('registerDbRoutes supports beforeWrite short-circuiting', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([]));
  const db = await openDb({ cwd });
  const app = fakeHonoApp();
  let methodHookCalled = false;

  registerDbRoutes(app, db, {
    prefix: '/api',
    lifecycleHooks: {
      beforeRequest() {},
      beforeWrite(ctx) {
        return ctx.c.json({ error: 'Forbidden' }, 403);
      },
    },
    hooks: {
      beforeCreate() {
        methodHookCalled = true;
      },
    },
  });

  const response = await app.route('POST', '/api/pages').handler(fakeHonoContext({
    body: {
      id: 'home',
      title: 'Home',
    },
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'Forbidden' });
  assert.equal(methodHookCalled, false);
  assert.equal(await db.collection('pages').exists('home'), false);
});

test('registerDbRoutes traces list, get, and write routes', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([{ id: 'home', title: 'Home' }]));
  const db = await openDb({ cwd });
  const traces = [];
  const unsubscribe = db.events.subscribe((event) => {
    if (event.type === 'request-trace') traces.push(event);
  });
  const app = fakeHonoApp();

  registerDbRoutes(app, db, {
    prefix: '/api',
    trace: {
      console: false,
    },
  });

  const list = await app.route('GET', '/api/pages').handler(fakeHonoContext({
    url: 'http://db.local/api/pages?select=id',
  }));
  const get = await app.route('GET', '/api/pages/:id').handler(fakeHonoContext({
    params: {
      id: 'home',
    },
    url: 'http://db.local/api/pages/home',
  }));
  const create = await app.route('POST', '/api/pages').handler(fakeHonoContext({
    body: {
      id: 'about',
      title: 'About',
    },
    url: 'http://db.local/api/pages',
  }));
  unsubscribe();

  assert.equal(list.status, 200);
  assert.equal(get.status, 200);
  assert.equal(create.status, 201);
  assert.match(list.headers['x-async-db-request-id'], /.+/);
  assert.match(get.headers['x-async-db-request-id'], /.+/);
  assert.match(create.headers['x-async-db-request-id'], /.+/);
  assert.deepEqual(traces.map((trace) => trace.operation), ['list', 'get', 'create']);
  assert.deepEqual(traces.map((trace) => trace.route), ['hono-rest', 'hono-rest', 'hono-rest']);
  assert.deepEqual(traces.map((trace) => trace.resource), ['pages', 'pages', 'pages']);
  assert.equal(traces[0].pathname, '/api/pages');
  assert.deepEqual(traces[0].queryKeys, ['select']);
  assert.equal(traces[1].id, 'home');
  assert.equal(traces[2].status, 201);
  assert.equal(traces[2].phases.some((phase) => phase.name === 'collection-write'), true);
});

test('registerDbRoutes traces hook short-circuit responses', async () => {
  const cwd = await makeProject();
  await writeFixture(cwd, 'pages.json', JSON.stringify([]));
  const db = await openDb({ cwd });
  const traces = [];
  const unsubscribe = db.events.subscribe((event) => {
    if (event.type === 'request-trace') traces.push(event);
  });
  const app = fakeHonoApp();
  let methodHookCalled = false;

  registerDbRoutes(app, db, {
    prefix: '/api',
    trace: {
      slowMs: 0,
      console: false,
    },
    lifecycleHooks: {
      beforeRequest(ctx) {
        return ctx.c.json({ error: 'Unauthorized' }, 401);
      },
    },
    hooks: {
      beforeCreate() {
        methodHookCalled = true;
      },
    },
  });

  const response = await app.route('POST', '/api/pages').handler(fakeHonoContext({
    body: {
      id: 'home',
      title: 'Home',
    },
  }));
  unsubscribe();

  assert.equal(response.status, 401);
  assert.match(response.headers['x-async-db-request-id'], /.+/);
  assert.equal(methodHookCalled, false);
  assert.equal(await db.collection('pages').exists('home'), false);
  assert.equal(traces.length, 1);
  assert.equal(traces[0].route, 'hono-rest');
  assert.equal(traces[0].resource, 'pages');
  assert.equal(traces[0].operation, 'create');
  assert.equal(traces[0].status, 401);
  assert.equal(traces[0].hook, 'beforeRequest');
  assert.equal(traces[0].shortCircuit, true);
  assert.equal(traces[0].slow, true);
  assert.equal(traces[0].phases.some((phase) => phase.name === 'hono-hook' && phase.hook === 'beforeRequest'), true);
});

function fakeContext() {
  const values = new Map();
  return {
    set(key, value) {
      values.set(key, value);
    },
    get(key) {
      return values.get(key);
    },
  };
}

function fakeHonoApp() {
  const routes = [];
  const app = {
    routes,
    route(method, routePath) {
      return routes.find((route) => route.method === method && route.path === routePath);
    },
  };

  for (const method of ['get', 'post', 'patch', 'delete', 'put']) {
    app[method] = (routePath, handler) => {
      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        handler,
      });
    };
  }

  return app;
}

function fakeHonoContext(options = {}) {
  const headers = {};
  function response(body, status) {
    const result = {
      status,
      body,
    };
    if (Object.keys(headers).length > 0) {
      result.headers = { ...headers };
    }
    return result;
  }

  return {
    req: {
      param(name) {
        return options.params?.[name];
      },
      async json() {
        return options.body ?? {};
      },
      url: options.url ?? 'http://db.local/api/pages',
    },
    header(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    json(body, status = 200) {
      return response(body, status);
    },
    body(value, status = 200) {
      return response(value, status);
    },
  };
}
