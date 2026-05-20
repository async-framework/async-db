# Basic Example

## What This Teaches

Start here when you want the smallest schema-backed db workflow. It demonstrates sync, committed generated types, the viewer, and creating a record.

## Files To Inspect

- [db/users.schema.jsonc](./db/users.schema.jsonc): schema-backed collection with seed data.
- [db/settings.json](./db/settings.json): singleton document inferred from data.
- [db/operations/get-user.jsonc](./db/operations/get-user.jsonc): optional registered REST operation template.
- [src/generated/db.types.ts](./src/generated/db.types.ts): committed generated types.

## Run It

From the repository root, use the repo-internal CLI path:

```bash
node ./src/cli.js sync --cwd ./examples/basic
node ./src/cli.js operations build --cwd ./examples/basic
node ./src/cli.js serve --cwd ./examples/basic
```

Open the viewer:

```txt
http://127.0.0.1:7331/__db
```

## Expected Result

`sync` writes generated schema, types, and runtime state under `examples/basic/.db/`, plus the committed type copy in `src/generated/`.

`operations build` writes a full server registry and client-safe refs under
`examples/basic/src/generated/`.

## REST Request To Try

Leave `serve` running and run this from another terminal:

```bash
curl -X POST http://127.0.0.1:7331/users \
  -H 'content-type: application/json' \
  -d '{"id":"u_2","name":"Grace Hopper","email":"grace@example.com"}'
```

The equivalent CLI smoke command is:

```bash
node ./src/cli.js create users '{"id":"u_2","name":"Grace Hopper","email":"grace@example.com"}' --cwd ./examples/basic
```

## Registered Operation To Try

Build operations, then use the generated hash from
`examples/basic/src/generated/db.operation-refs.json`:

```bash
curl -X POST http://127.0.0.1:7331/__db/operations/sha256:HASH \
  -H 'content-type: application/json' \
  -d '{"variables":{"id":"u_1"}}'
```

## Cleanup

Generated `.db/` output is ignored by git and can be removed whenever you want a fresh mirror.

## More Docs

- [Getting Started](../../docs/getting-started.md)
- [Generated Files](../../docs/generated-files.md)
