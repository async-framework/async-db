# Generated Files

jsondb writes generated output during `sync`, `serve`, package API startup, and some smoke commands. Know which files are runtime state and which files are intentionally committed.

## Default Generated Output

Default sync output:

```txt
.jsondb/schema.generated.json
.jsondb/types/index.ts
.jsondb/state/*.json
```

`.jsondb/` is normally uncommitted. It contains generated schema metadata, generated TypeScript types, source metadata, and writable runtime store state.

## Runtime State

With the default JSON store:

```txt
db/users.json              source fixture
.jsondb/state/users.json   writable runtime JSON store
```

REST writes, GraphQL mutations, package API writes, and viewer operations write to runtime state. Changed source fixtures refresh state based on source hashes; unchanged source fixtures preserve runtime edits.

## Generated Ids

Collections need ids. If a JSON, JSONC, or CSV collection fixture omits `id`, jsondb adds counter ids in the selected runtime store.

Source fixtures stay unchanged by default. For resources bound to the `sourceFile` store, jsondb may write generated ids back to plain `.json` collection fixtures when configured intentionally.

## Generated Types

Default generated TypeScript output:

```txt
.jsondb/types/index.ts
```

Use `types.commitOutFile` when TypeScript imports should work before anyone runs sync:

```js
import { defineConfig } from 'jsondb/config';

export default defineConfig({
  types: {
    commitOutFile: './src/generated/jsondb.types.ts',
  },
});
```

Field descriptions become TypeScript JSDoc:

```ts
export type User = {
  /** Stable user id. */
  id: string;

  /** Email address used for local sign-in. */
  email: string;
};
```

Selected examples intentionally commit generated type output:

```txt
examples/advanced/src/generated/jsondb.types.ts
examples/basic/src/generated/jsondb.types.ts
examples/schema-first/src/generated/jsondb.types.ts
examples/schema-manifest/src/generated/jsondb.types.ts
examples/schema-ui/src/generated/jsondb.types.ts
```

## Schema Manifest Output

Use `schemaOutFile` when a local admin, CMS, or form-building UI needs runtime schema metadata:

```js
import { defineConfig } from 'jsondb/config';

export default defineConfig({
  schemaOutFile: './src/generated/jsondb.schema.json',
});
```

`jsondb sync` writes the manifest when `schemaOutFile` is set. You can also generate it directly:

```bash
npm run db -- schema manifest --out ./src/generated/jsondb.schema.json
```

The manifest includes normalized resource and field metadata such as `type`, `required`, `nullable`, `default`, `values`, nested `fields`, array `items`, relations, and generated UI defaults. The manifest file is metadata output only. Schema field defaults still drive configured runtime behavior such as create-time defaults and safe additive store hydration.

The manifests at [examples/schema-manifest/src/generated/jsondb.schema.json](../examples/schema-manifest/src/generated/jsondb.schema.json) and [examples/schema-ui/src/generated/jsondb.schema.json](../examples/schema-ui/src/generated/jsondb.schema.json) are intentionally committed.

## Viewer Manifest Output

Use `viewerManifestOutFile` when a custom data viewer needs the same JSON metadata used by the built-in viewer:

```js
import { defineConfig } from 'jsondb/config';

export default defineConfig({
  viewerManifestOutFile: './src/generated/jsondb.viewer.json',
});
```

`jsondb sync` writes the viewer manifest when `viewerManifestOutFile` is set. You can also generate it directly:

```bash
npm run db -- viewer manifest --out ./src/generated/jsondb.viewer.json
```

The viewer manifest includes field metadata, UI hints, relation hints, diagnostics, capabilities, configured viewer links, and API links such as `/__jsondb/manifest`, `/__jsondb/manifest.json`, `/__jsondb/manifest.html`, `/__jsondb/manifest.md`, `/__jsondb/batch`, `/graphql`, and each REST resource route. It does not include seed records, source paths, source hashes, runtime state paths, or GraphQL SDL. Fetch actual records from REST or GraphQL.

## Cleanup Rules

- Do not commit `.jsondb/` unless a task explicitly asks for generated runtime state.
- Do commit configured `types.commitOutFile` output when an app needs stable imports in a fresh checkout.
- Do commit configured `schemaOutFile` output when an app needs stable schema metadata at runtime.
- Do commit configured `viewerManifestOutFile` output when a custom viewer needs stable metadata and route links at runtime.
- Smoke commands against examples may create `examples/*/.jsondb/`; remove that generated runtime output before finalizing.

## Related Examples

- [Basic](../examples/basic/README.md)
- [Schema Manifest](../examples/schema-manifest/README.md)
