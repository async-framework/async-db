# @async/db

@async/db is the Async data workflow package for local fixtures, generated APIs, and production graduation.

Use it to:

- Put editable JSON, JSONC, or CSV fixtures in `db/` as the built-in prototype source mode.
- Browse records in a lightweight built-in viewer.
- Call local REST routes while the backend contract is still forming.
- Generate TypeScript types from fixtures and schemas.
- Emit schema metadata for admin, CMS, or form-building screens.
- Start data-first, then graduate toward SQLite-backed APIs when stricter contracts and production storage pay for themselves.

## File Map

| Files | Purpose |
| --- | --- |
| `db/*.json`, `db/*.jsonc`, `db/*.csv` | Fixture data |
| `db/*.schema.json`, `db/*.schema.jsonc`, `db/*.schema.mjs` | Optional stricter schema contracts |
| `.db/state/*` | Generated writable JSON store state |
| `.db/schema.generated.json`, `.db/types/index.ts` | Generated metadata and types |

## Quick Summary

Most projects can start with the defaults:

1. Put fixtures in `db/`.
2. Run `async-db sync` to generate schema metadata, TypeScript types, and runtime state.
3. Run `async-db serve` to start the local API and viewer.
4. Open `http://127.0.0.1:7331/__db`.
5. Call REST routes like `GET /db/users.json` and `POST /db/users`.
6. Add schema only when the fixture shape needs a clearer contract.

The default server is REST-first. GraphQL is available at `/graphql`, but you do not need it for the core workflow.

## Examples

The examples are ordered as a learning path. Start with [basic](./examples/basic)
to see the core fixture-to-viewer loop, then move through data-first schemas,
relations, clients, manifest-driven UIs, permission models, and common app
models.

Other useful paths:

- [`examples/data-first`](./examples/data-first): the smallest data-first example when you want plain fixtures before schemas.
- [`examples/rest-client`](./examples/rest-client): learn REST reads, query shaping, and batching from app or test code.
- [`examples/blog`](./examples/blog): replace a small blog with fixture-backed posts, authors, tags, dated Markdown, and images.
- [`examples/admin-panel`](./examples/admin-panel): manage database records with package API create, patch, read, and delete calls.
- [`examples/cms-with-page-builder`](./examples/cms-with-page-builder): model marketing pages with reusable blocks, templates, media, and menus.
- [`examples/agent-task-board`](./examples/agent-task-board): model AI-startup-style agent tasks, runs, steps, tools, artifacts, and approvals.

For the complete ordered guide, see [examples/README.md](./examples/README.md)
or [Which Example Should I Start With?](#which-example-should-i-start-with).

## Install

Until the package is published, install it from GitHub in the app or package that will use it. Pin a reviewed commit SHA or release tag instead of the moving default branch:

```json
{
  "devDependencies": {
    "@async/db": "github:PatrickJS/async-db#<reviewed-commit-sha-or-tag>"
  },
  "scripts": {
    "db": "async-db",
    "db:sync": "async-db sync",
    "db:serve": "async-db serve",
    "db:types": "async-db types"
  }
}
```

Replace the placeholder with the commit SHA or tag you reviewed. After package publication, prefer the published semver version. Then run:

```bash
npm install
```

The package import name is `@async/db`; helpers are available from `@async/db/config`, `@async/db/schema`, and `@async/db/client`.

## Five-Minute Start

Create a fixture:

```bash
mkdir -p db
cat > db/users.json <<'JSON'
[
  {
    "id": "u_1",
    "name": "Ada Lovelace",
    "email": "ada@example.com"
  }
]
JSON
```

Sync generated metadata, types, and runtime state:

```bash
npm run db:sync
```

Start the local API and viewer in terminal 1:

```bash
npm run db:serve
```

Open the viewer:

```txt
http://127.0.0.1:7331/__db
```

Call the REST API from terminal 2:

```bash
curl http://127.0.0.1:7331/db/users.json
```

Create a local record:

```bash
curl -X POST http://127.0.0.1:7331/db/users \
  -H 'content-type: application/json' \
  -d '{"id":"u_2","name":"Grace Hopper","email":"grace@example.com"}'
```

The default sync output is generated:

```txt
.db/schema.generated.json
.db/types/index.ts
.db/state/users.json
```

`serve` syncs on startup, watches the fixture folder, refreshes valid resources when files change, and surfaces file-specific diagnostics in the viewer without breaking unrelated resources.

See [docs/getting-started.md](./docs/getting-started.md) for the expanded walkthrough.

## Operational Contract

| Behavior | Default |
| --- | --- |
| Source fixtures | Read from `./db` recursively. |
| App data routes | Exposed under `/db` by default, such as `GET /db/users.json`. |
| Runtime writes | Go to the default JSON store under `.db/state`. |
| Source writes | Only happen for resources bound to the `sourceFile` store, and only for supported writebacks such as generated ids in plain `.json` collections. |
| Optional stores | SQLite, Postgres, generic KV, and Redis-like stores plug into the same runtime store boundary without adding mandatory database client dependencies. |
| Generated output | `.db/` is runtime output and normally stays uncommitted. |
| Local server | Binds to `127.0.0.1:7331` by default and exposes writable local development endpoints. |
| Trusted code | `.schema.mjs`, `db.config.mjs`, source readers, derived sources, and manifest hooks execute as local project code. |
| Mock latency | Responses include a small `30-100ms` delay by default so loading states are visible. |

@async/db is local development/test infrastructure. It is not a production database, not an auth layer, and not a broad JSON Schema compatibility project.

## Add Schema When It Pays For It

Data-first fixtures are enough until the shape matters. Inspect what @async/db infers:

```bash
npm run db -- schema infer
npm run db -- schema infer users
npm run db -- schema infer users --out db/users.schema.jsonc
```

Add `db/users.schema.json`, `db/users.schema.jsonc`, or `db/users.schema.mjs` when you need stricter behavior:

```json
{
  "kind": "collection",
  "idField": "id",
  "fields": {
    "id": { "type": "string", "required": true },
    "name": { "type": "string", "required": true },
    "email": {
      "type": "string",
      "required": true,
      "unique": true,
      "description": "Email address used for local sign-in."
    },
    "role": {
      "type": "enum",
      "values": ["admin", "user"],
      "default": "user"
    }
  }
}
```

Then validate:

```bash
npm run db -- schema validate
```

In mixed mode, schema files define the contract and data files provide seed records. Unknown fields warn by default; configure `schema.unknownFields: 'error'` when drift should fail.

Schema defaults fill omitted fields on create and safe additive runtime hydration. Updates, patches, and document puts preserve omitted fields; include a field in the write body when you want to change it.

See [docs/concepts.md](./docs/concepts.md) and [docs/fixtures-and-schemas.md](./docs/fixtures-and-schemas.md).

## Admin/CMS Schema Metadata

Schemas can also drive local admin, CMS, custom data viewers, and form-building screens. Use `GET /__db/manifest.json` at runtime when a UI runs beside `async-db serve`, or configure `outputs.viewerManifest` when app code needs a committed JSON artifact with the same viewer metadata. Browser requests can open `GET /__db/manifest.html`; AI clients can use `GET /__db/manifest.md`; `GET /__db/manifest` lets the `Accept` header choose among registered response formats.

Use `outputs.schemaManifest` when an app only needs the smaller model metadata file without server route links, diagnostics, or viewer capabilities.

```js
import { defineConfig, mergeManifest } from '@async/db/config';

export default defineConfig({
  outputs: {
    schemaManifest: './src/generated/db.schema.json',
    viewerManifest: './src/generated/db.viewer.json',
  },

  server: {
    viewerLinks: [
      { label: 'App Data Viewer', href: 'http://127.0.0.1:5173/db' },
    ],
  },

  schemaManifest: {
    customizeResource({ file, defaultManifest }) {
      // Group fields by source folder so an admin shell can show CMS records
      // separately from operational data without hard-coding that in the UI.
      return mergeManifest(defaultManifest, {
        schemaUi: {
          group: file?.startsWith('db/cms/') ? 'CMS' : 'Data',
        },
      });
    },

    customizeField({ fieldName, path, defaultManifest }) {
      if (fieldName.endsWith('Markdown')) {
        // Markdown body fields need a richer editor than a plain text input,
        // but the fixture record should still stay normal JSON data.
        return mergeManifest(defaultManifest, {
          schemaUi: { component: 'markdown' },
        });
      }

      if (path === 'blocks.chartId') {
        // Relation ids stay as strings in fixtures, while the generated
        // manifest tells the admin UI to render a picker backed by charts.
        return mergeManifest(defaultManifest, {
          schemaUi: {
            component: 'relation-select',
            relationTo: 'charts',
          },
        });
      }

      return defaultManifest;
    },
  },
});
```

The generated manifest is metadata output; schema defaults and validation still come from the schema contract. Actual records stay on REST or GraphQL routes, so a custom viewer fetches `manifest.json` for fields and route links, then calls the listed resource routes for rows. `server.viewerLinks` exposes custom viewer URLs in root discovery and the shared manifest.

See [docs/generated-files.md](./docs/generated-files.md) and [examples/schema-manifest](./examples/schema-manifest).

## Common Commands

With the `db` script from the install snippet:

```bash
npm run db -- sync
npm run db -- types
npm run db -- types --watch
npm run db -- types --out ./src/generated/db.types.ts
npm run db -- schema
npm run db -- schema users
npm run db -- schema infer users
npm run db -- schema validate
npm run db -- doctor
npm run db -- check --strict
npm run db -- create users '{"id":"u_2","name":"Grace Hopper","email":"grace@example.com"}'
npm run db -- serve
npm run db -- generate hono
```

With pnpm and the same `"db": "async-db"` script:

```bash
pnpm db sync
pnpm db schema validate
pnpm db serve
```

See [docs/package-api.md](./docs/package-api.md) for CLI and package export details.

## REST, GraphQL, And Viewer

The local server exposes REST routes for collections and singleton documents, plus a focused GraphQL endpoint at `/graphql` for apps that prefer GraphQL. REST remains the default path because it pairs directly with the viewer and local fixture workflow.
Set `rest.enabled: false` when an app wants schema, manifest, viewer, import, events, and GraphQL routes without generated REST resource routes or REST batching.
Set `graphql.enabled: false` when an app wants REST and dev-tool routes without a GraphQL endpoint.

```txt
GET     /db/users.json
GET     /db/users/:id.json
POST    /db/users
PATCH   /db/users/:id
DELETE  /db/users/:id

GET     /db/settings.json
PUT     /db/settings
PATCH   /db/settings
```

Use `select`, `offset`, and `limit` when a prototype only needs part of a collection:

```bash
curl 'http://127.0.0.1:7331/db/users.json?select=id,name&offset=0&limit=20'
curl 'http://127.0.0.1:7331/db/users.json?id=u_1&select=id,name'
```

The `?id=` shortcut is only for explicit JSON routes. Extensionless REST routes
use normal record URLs such as `/db/users/u_1`.

The `.json` route is a fixture-like URL for the synced runtime resource:
`db/users.json` maps to `GET /db/users.json`, while local writes still go to
the selected runtime store. See [Fixture-Like `.json` Routes](./docs/server-and-viewer.md#fixture-like-json-routes).

The viewer at `/__db` lets you inspect resources, import CSV files into the configured fixture folder, view generated schema metadata, read GraphQL SDL/operation references, and try REST requests without writing client code first.

The built-in viewer and custom viewer UIs use the same JSON manifest at `/__db/manifest.json`. `/__db/manifest.html` opens a formatted JSON viewer, `/__db/manifest.md` returns an AI-friendly Markdown wrapper, and `/__db/manifest` chooses from registered media types in `Accept`. Apps can use `api.formats` from the manifest to discover supported extensions and build their own viewer UI against REST or GraphQL records.

See [docs/server-and-viewer.md](./docs/server-and-viewer.md). When local
`/db/*` routes are ready to become `/api/db/*` or `/api/*` production API
routes, see the
[Prototype To Production REST Guide](./docs/prototype-to-production.md).

## Generated Files

| Path | Commit? | Notes |
| --- | --- | --- |
| `.db/` | Normally no | Runtime stores, source metadata, generated schema, and generated types. |
| `.db/state/*.json` | Normally no | Writable local JSON store state. |
| `.db/types/index.ts` | Normally no | Default generated TypeScript output. |
| `outputs.committedTypes` output | Yes, when configured | Use for stable imports before sync runs. |
| `outputs.schemaManifest` output | Yes, when configured | Use for model-driven admin/CMS metadata. |
| `outputs.viewerManifest` output | Yes, when configured | Use for custom data viewers that need metadata plus route links. |
| `examples/*/src/generated/db.types.ts` | Yes, in selected examples | Intentionally committed example type output. |
| `examples/*/src/generated/db.schema.json` | Yes, in selected examples | Intentionally committed example manifest. |

Smoke commands may create `.db/` under examples. Remove generated runtime state before finalizing unless a task explicitly asks to commit it.

See [docs/generated-files.md](./docs/generated-files.md).

## Which Example Should I Start With?

The examples are a learning path ordered from smallest local fixture workflow to more app-like integrations. Run any example with `node ./src/cli.js sync --cwd ./examples/<name>` and `node ./src/cli.js serve --cwd ./examples/<name>`, or run `npm run examples` to start every viewer from one index.

| Order | Example | What it shows |
| --- | --- | --- |
| 1 | [`examples/basic`](./examples/basic) | Learn the core loop: put data in `db/`, run `sync`, inspect the viewer, and write through REST. |
| 2 | [`examples/data-first`](./examples/data-first) | See how @async/db infers collections, documents, routes, and types from plain fixture files. |
| 3 | [`examples/schema-first`](./examples/schema-first) | Define resources from schemas first when you need a contract before seed data exists. |
| 4 | [`examples/csv`](./examples/csv) | Use CSV as source data and see how source changes refresh the runtime mirror. |
| 5 | [`examples/csv-dashboard`](./examples/csv-dashboard) | Drop CSV files into an empty runtime dashboard powered by the live manifest and REST rows. |
| 6 | [`examples/docs`](./examples/docs) | Convert Markdown source files into normal JSON records with a custom source reader. |
| 7 | [`examples/derived-sources`](./examples/derived-sources) | Build a virtual resource from sibling fixture files without writing a generated fixture. |
| 8 | [`examples/relations`](./examples/relations) | Add relation metadata so REST reads can `expand` related records and select nested fields. |
| 9 | [`examples/rest-client`](./examples/rest-client) | Call @async/db from app or test code with direct REST reads and batched requests. |
| 10 | [`examples/schema-manifest`](./examples/schema-manifest) | Generate importable model metadata for tools, forms, or custom viewers. |
| 11 | [`examples/schema-ui`](./examples/schema-ui) | Render a small flat admin-style page from manifest fields and runtime records. |
| 12 | [`examples/recursive-schema-ui`](./examples/recursive-schema-ui) | Build recursive forms for nested objects and arrays, then save edits by JSON Pointer path. |
| 13 | [`examples/admin-panel`](./examples/admin-panel) | Use the package API for lightweight settings and feature-flag CRUD. |
| 14 | [`examples/blog`](./examples/blog) | Model content publishing with posts, authors, tags, related posts, dated Markdown files, and images. |
| 15 | [`examples/cms`](./examples/cms) | Model CMS content with published/unpublished pages, media, menus, and blocks. |
| 16 | [`examples/cms-with-page-builder`](./examples/cms-with-page-builder) | Model published/unpublished marketing pages with reusable page-builder blocks, templates, media, and menus. |
| 17 | [`examples/forums`](./examples/forums) | Model a small discussion system with categories, topics, users, and replies. |
| 18 | [`examples/issue-tracker`](./examples/issue-tracker) | Model workflow data with projects, issues, labels, assignees, comments, and priority. |
| 19 | [`examples/approval-workflow`](./examples/approval-workflow) | Model team invitations, human reviews, approval gates, and ready actions. |
| 20 | [`examples/catalog`](./examples/catalog) | Model product catalog data with categories, image arrays, prices, and inventory. |
| 21 | [`examples/ecommerce`](./examples/ecommerce) | Extend catalog data into carts, discounts, orders, payments, and shipments. |
| 22 | [`examples/diagnostics`](./examples/diagnostics) | See how @async/db reports schema/data drift without breaking unrelated resources. |
| 23 | [`examples/advanced`](./examples/advanced) | Combine `.schema.mjs`, mixed mode, defaults, and nested objects in one project. |
| 24 | [`examples/hono-auth`](./examples/hono-auth) | Mount @async/db behind an optional Hono app with auth and lifecycle hooks. |

The early examples start with the simplest rule: one file is one resource, such
as `db/users.json` for a `users` collection. Later content examples also show a
mixed source layout, where a folder is the resource and each file is one record:
`examples/docs` uses `db/docs/**/*.md` as the `docs` collection, while
`examples/blog` uses `db/posts/YYYY/MM/DD/*.md` as the `posts` collection next
to file-backed `authors` and `tags` collections.
`examples/derived-sources` shows a related virtual-source pattern: `sources.derived`
builds a `dataSources` resource from sibling `db/data/*.json` fixtures without
writing a generated fixture file.

### Agentic Examples

Agentic examples are grouped separately because they teach reusable agent app
infrastructure data shapes, not one product domain. They use seeded local data
only: no model calls, background workers, external tools, or side effects.

| Type | Example | Usually used for |
| --- | --- | --- |
| Task board | [`examples/agent-task-board`](./examples/agent-task-board) | Agent tasks, runs, steps, tool use, artifacts, and human approvals. |
| Memory workspace | [`examples/agent-memory-workspace`](./examples/agent-memory-workspace) | Durable memory with sources, chunks, claims, citations, conflicts, and refresh jobs. |
| Tool registry | [`examples/agent-tool-registry`](./examples/agent-tool-registry) | Agent tool scopes, risky tool requests, calls, policies, and audit events. |
| Evaluation lab | [`examples/agent-evaluation-lab`](./examples/agent-evaluation-lab) | Prompt and model eval runs with test cases, scores, and regressions. |

### Permission Examples

Access control is listed separately because these examples teach policy data shapes, not the main @async/db learning sequence. @async/db stores the records; app code decides what those records mean.

| Type | Example | Usually used for |
| --- | --- | --- |
| RBAC | [`examples/permission-rbac`](./examples/permission-rbac) | Role-driven web apps with admins, editors, moderators, and viewers. |
| ABAC | [`examples/permission-abac`](./examples/permission-abac) | Granular enterprise rules based on user, resource, and environment attributes. |
| ReBAC | [`examples/permission-rebac`](./examples/permission-rebac) | Social graphs, team membership, nested folders, and relationship-based sharing. |
| ACL | [`examples/permission-acl`](./examples/permission-acl) | Resource-local allow lists for smaller apps or simple document sharing. |
| PBAC | [`examples/permission-pbac`](./examples/permission-pbac) | Central policy records that app code evaluates consistently across resources. |

### Login Examples

Login examples are grouped separately because they teach common authentication
record shapes. The fixtures intentionally use metadata, fingerprints, and
prefixes instead of raw passwords, reset tokens, OAuth tokens, or API keys.

| Pattern | Example | Usually used for |
| --- | --- | --- |
| Password login | [`examples/login-password`](./examples/login-password) | Apps that own password credentials, sessions, and reset requests. |
| Magic link or code | [`examples/login-magic-link`](./examples/login-magic-link) | Passwordless email links or short-lived login codes. |
| OAuth or OIDC | [`examples/login-oauth`](./examples/login-oauth) | Provider account linking with Google, GitHub, Microsoft, or similar. |
| Organization login | [`examples/login-organization`](./examples/login-organization) | SaaS workspaces where access depends on organization membership. |
| API keys | [`examples/login-api-keys`](./examples/login-api-keys) | Machine access with service accounts, key scopes, and audit events. |

Each example README is the runnable authority for that example.

## Docs Map

| Task | Read |
| --- | --- |
| Start a project | [docs/getting-started.md](./docs/getting-started.md) |
| Understand the model | [docs/concepts.md](./docs/concepts.md) |
| Author fixtures and schemas | [docs/fixtures-and-schemas.md](./docs/fixtures-and-schemas.md) |
| Manage generated output | [docs/generated-files.md](./docs/generated-files.md) |
| Configure @async/db | [docs/configuration.md](./docs/configuration.md) |
| Serve local data and use REST/GraphQL/viewer | [docs/server-and-viewer.md](./docs/server-and-viewer.md) |
| Graduate REST prototypes to production API routes | [docs/prototype-to-production.md](./docs/prototype-to-production.md) |
| Use the package API, CLI, or exports | [docs/package-api.md](./docs/package-api.md) |
| Integrate with Vite, Hono, or SQLite | [docs/integrations.md](./docs/integrations.md) |
| Validate CI and package contents | [docs/ci-and-release.md](./docs/ci-and-release.md) |
| Understand implementation boundaries | [docs/architecture.md](./docs/architecture.md) |

For the full product behavior and acceptance model, see [SPEC.md](./SPEC.md).
