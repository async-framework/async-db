# @async/db Examples

Each folder is a small runnable @async/db project. Open the README in an
example, inspect its `db/` files, run `sync`, then start `serve` when you want
to browse the generated viewer and REST routes.

Start at the top if you are new to @async/db. Jump to a later example when it
matches the shape of the app you are building.

Common starter paths:

- [data-first](./data-first): the smallest data-first example when you want plain fixtures before schemas.
- [rest-client](./rest-client): learn REST reads, query shaping, and batching from app or test code.
- [blog](./blog): replace a small blog with fixture-backed posts, authors, tags, dated Markdown, and images.
- [admin-panel](./admin-panel): manage database records with package API create, patch, read, and delete calls.
- [cms-with-page-builder](./cms-with-page-builder): model marketing pages with reusable blocks, templates, media, and menus.
- [agent-task-board](./agent-task-board): model AI-startup-style agent tasks, runs, steps, tools, artifacts, and approvals.

| Order | Example | Learn this next |
| --- | --- | --- |
| 1 | [basic](./basic) | The core loop: fixture data, `sync`, generated types, the viewer, and a REST write. |
| 2 | [data-first](./data-first) | How far plain JSON fixtures can take you before writing schema files. |
| 3 | [schema-first](./schema-first) | How to define resources from schemas first, including empty collections and singleton documents. |
| 4 | [csv](./csv) | How CSV files become typed resources and how source changes refresh runtime state. |
| 5 | [csv-dashboard](./csv-dashboard) | How an empty runtime dashboard can import CSV files and render manifest-driven charts. |
| 6 | [docs](./docs) | How a custom Markdown reader can turn source documents into normal @async/db records. |
| 7 | [derived-sources](./derived-sources) | How to build a virtual resource from sibling fixture files without writing a generated fixture. |
| 8 | [relations](./relations) | How relation metadata powers `expand` and nested `select` in REST reads. |
| 9 | [rest-client](./rest-client) | How app code can call @async/db over HTTP with direct REST reads and batched requests. |
| 10 | [schema-manifest](./schema-manifest) | How to emit model metadata that another tool or UI can import. |
| 11 | [schema-ui](./schema-ui) | How to render a small flat admin-style page from manifest fields and runtime records. |
| 12 | [recursive-schema-ui](./recursive-schema-ui) | How to walk nested objects and arrays from the manifest and save edits by JSON Pointer path. |
| 13 | [admin-panel](./admin-panel) | How to use the package API for settings and feature-flag CRUD. |
| 14 | [blog](./blog) | How to model posts with authors, tags, related posts, dated Markdown files, and image metadata. |
| 15 | [cms](./cms) | How to model CMS content with published/unpublished pages, media, menus, and blocks. |
| 16 | [cms-with-page-builder](./cms-with-page-builder) | How to model published/unpublished marketing pages with reusable page-builder blocks, templates, media, and menus. |
| 17 | [forums](./forums) | How to model a small discussion system with categories, topics, users, and replies. |
| 18 | [issue-tracker](./issue-tracker) | How to model workflow data with projects, issues, labels, assignees, comments, and priority. |
| 19 | [approval-workflow](./approval-workflow) | How to model change requests that need invited reviewers, team approvals, and follow-up actions. |
| 20 | [catalog](./catalog) | How to model products, categories, images, prices, and inventory. |
| 21 | [ecommerce](./ecommerce) | How to extend catalog data into carts, discounts, orders, payments, and shipments. |
| 22 | [diagnostics](./diagnostics) | How @async/db reports schema/data drift without breaking unrelated resources. |
| 23 | [advanced](./advanced) | How multiple features work together: `.schema.mjs`, mixed mode, defaults, and nested objects. |
| 24 | [hono-auth](./hono-auth) | How to mount @async/db behind an optional Hono app with auth and lifecycle hooks. |

## Mixed Source Layouts

The first examples use the simplest shape: one source file is one resource. For
example, `db/users.json` is the `users` collection, and `db/settings.json` can be
a singleton document.

Content-heavy apps often want a folder to act as the collection instead. In
those examples, a custom source reader treats many files as one resource:

```txt
db/
  docs/                         # folder is the docs collection
    index.md                    # one docs record
    guides/getting-started.md   # one docs record

  posts/                        # folder is the posts collection
    2026/05/01/local-fixtures-first.md

  authors.schema.jsonc          # file is the authors collection
  tags.schema.jsonc             # file is the tags collection
```

This is a mixed source layout. It is different from async/db's schema/data
mixed mode: here, the project simply mixes file-backed resources and
folder-backed resources because that matches how docs and blog content are
usually authored.

`derived-sources` uses a virtual source instead: it indexes sibling JSON
fixtures into a `dataSources` resource with dependency hashes, without writing a
generated fixture file.

## Agentic Examples

These are grouped separately because agentic apps often need reusable execution,
memory, tool-governance, and evaluation data before they need a specific product
domain. The examples use seeded local data only: no model calls, external tools,
background jobs, or side effects.

| Type | Example | Usual fit |
| --- | --- | --- |
| Task board | [agent-task-board](./agent-task-board) | Agent tasks, runs, steps, tool use, artifacts, and approval checkpoints. |
| Memory workspace | [agent-memory-workspace](./agent-memory-workspace) | Durable memory with sources, chunks, claims, citations, conflicts, and refresh jobs. |
| Tool registry | [agent-tool-registry](./agent-tool-registry) | Scoped tool access, risky tool requests, calls, policies, and audit events. |
| Evaluation lab | [agent-evaluation-lab](./agent-evaluation-lab) | Prompt and model eval runs with test cases, scores, and regressions. |

## Permission Examples

These are grouped separately because access control is an app-owned policy decision. @async/db stores and serves the records; the example HTML scripts evaluate those records to show simple allow/deny decisions.

| Type | Example | Usual fit |
| --- | --- | --- |
| RBAC | [permission-rbac](./permission-rbac) | Web apps with clear roles such as admin, editor, moderator, and viewer. |
| ABAC | [permission-abac](./permission-abac) | Enterprise or internal tools where user, resource, and environment attributes all matter. |
| ReBAC | [permission-rebac](./permission-rebac) | Social graphs, org charts, folders, teams, and Google Docs-style sharing. |
| ACL | [permission-acl](./permission-acl) | Simple resource-local grants for a limited number of users, groups, or documents. |
| PBAC | [permission-pbac](./permission-pbac) | Centralized policies that should be reviewed, versioned, and evaluated consistently. |

## Login Examples

These are common login-related record shapes. They are not authentication
implementations, and the fixtures use metadata, fingerprints, and prefixes
instead of raw passwords, reset tokens, OAuth tokens, API keys, or session
secrets.

| Pattern | Example | Usual fit |
| --- | --- | --- |
| Password login | [login-password](./login-password) | Apps that own password credentials, sessions, and reset requests. |
| Magic link or code | [login-magic-link](./login-magic-link) | Passwordless email links or short-lived login codes. |
| OAuth or OIDC | [login-oauth](./login-oauth) | Provider account linking with Google, GitHub, Microsoft, or similar. |
| Organization login | [login-organization](./login-organization) | SaaS workspaces where access depends on organization membership. |
| API keys | [login-api-keys](./login-api-keys) | Machine access with service accounts, key scopes, and audit events. |
