# Integrations

jsondb keeps integrations optional. The core package remains dependency-light; apps opt into Vite, Hono, SQLite, or generated starter code when they need those paths.

## Vite Dev Server Plugin

Vite apps can mount jsondb into the existing dev server instead of running `jsondb serve` on a second port:

```js
import { defineConfig } from 'vite';
import { jsondbPlugin } from 'jsondb/vite';

export default defineConfig({
  plugins: [
    jsondbPlugin(),
  ],
});
```

The plugin is dev-only (`apply: 'serve'`). It does not run during `vite build`, and it does not add a mandatory Vite dependency to jsondb.

By default, dev routes are scoped so they do not steal app URLs:

```txt
GET  /__jsondb
GET  /__jsondb/schema
POST /__jsondb/batch
POST /__jsondb/graphql
GET  /__jsondb/rest/users
GET  /__jsondb/rest/users/u_1
```

Use the virtual browser client from app code:

```ts
import jsondb, { fork } from 'virtual:jsondb/client';

const users = await jsondb.rest.get('/users');
const selected = await jsondb.rest.get('/users?select=id,name');

const legacyDb = fork('legacy-demo');
const legacyUsers = await legacyDb.rest.get('/users');
```

Plugin options include `cwd`, `dbDir`, `stateDir`, `forks`, `apiBase`, `restBasePath`, `graphqlPath`, `rootRoutes`, `clientVirtualModule`, and `clientImport`.
The plugin uses `apiBase` first, then `server.apiBase`, then `/__jsondb` for scoped dev routes.

Set `rootRoutes: true` only when you intentionally want Vite dev to also answer unscoped routes like `/users`. Standalone `jsondb serve` keeps those root REST routes by default.

The plugin watches fixture sources, not generated runtime output. jsondb also skips rewriting generated and state files when their content is unchanged, so normal `sync` or `openJsonFixtureDb()` calls should not trigger Vite reloads by changing mtimes alone.

If an app commits generated jsondb files under frontend source, Vite may still reload when those files genuinely change. Ignore only generated files that the browser does not need to hot reload.

```ts
export default defineConfig({
  server: {
    watch: {
      ignored: [
        '../.jsondb/**',
        // Only include committed generated files here when browser code
        // does not import them at runtime.
        'src/generated/jsondb.schema.json',
        'src/generated/jsondb.types.ts',
      ],
    },
  },
});
```

## Hono Route Registration

Apps that own a Hono instance can register jsondb REST routes and wrap them with lifecycle hooks.

```ts
import { registerRestRoutes } from 'jsondb/hono';

registerRestRoutes(app, db, {
  prefix: '/api',
  resources: ['pages', 'charts'],
  lifecycleHooks: {
    beforeRequest({ c }) {
      const session = readSession(c.req.header('authorization'));
      if (!session) return c.json({ error: 'Unauthorized' }, 401);
      c.set('session', session);
    },
    beforeWrite({ c, body }) {
      if (c.get('session')?.role !== 'admin') {
        return c.json({ error: 'Forbidden' }, 403);
      }
      if (body) body.updatedAt = new Date().toISOString();
    },
  },
  hooks: {
    beforeCreate({ body }) {
      body.createdAt ??= body.updatedAt;
    },
  },
});
```

Hook order is deterministic:

1. `beforeRequest`
2. `beforeWrite` for `create`, `patch`, `put`, or `delete`
3. matching global method hook
4. matching resource method hook
5. JSONDB operation

Any hook can return a Hono response to short-circuit the request. Write hooks can mutate `body` before JSONDB validates and writes it.

See [examples/hono-auth](../examples/hono-auth/README.md) for a runnable Hono app with bearer-token auth.

## Hono And SQLite Starter Generation

When fixtures and schemas have settled enough to graduate toward a real database API, generate a Hono starter:

```bash
jsondb generate hono
jsondb generate hono --api rest,graphql --out ./server
jsondb generate hono --api none --app module
```

The default output is `./jsondb-api` with REST routes, a portable repository interface, a `node:sqlite` adapter, validators, and an initial SQL migration.

Generated standalone apps are TypeScript-first and target Node.js `>=22.13` because SQLite output uses `node:sqlite`.

The main package stays dependency-light. Generated apps declare their own `hono`, `@hono/node-server`, `typescript`, and `tsx` dependencies.

Generation fails on schema errors and, by default, on schema warnings so production starter code only uses declared schema fields. Pass `--allow-warnings` only when you intentionally want to generate with warning diagnostics.

## Optional Runtime Hono/SQLite

Apps can also use optional runtime exports directly:

```ts
import { Hono } from 'hono';
import { createJsonDbHonoApp } from 'jsondb/hono';

const app = new Hono();
app.route('/api', await createJsonDbHonoApp({
  dbDir: './db',
  storage: {
    kind: 'sqlite',
    file: './data/app.sqlite',
  },
  api: ['rest'],
}));
```

These integrations are opt-in. They should not make `hono`, `@hono/node-server`, or SQLite libraries mandatory dependencies of the core package.
