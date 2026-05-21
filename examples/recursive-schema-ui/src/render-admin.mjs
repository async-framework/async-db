import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { renderTemplateCatalog } from './cms-ssr.mjs';

/** @param {unknown} schemaManifest */
export function renderSchemaUiHtml(schemaManifest) {
  return renderTemplateCatalog(schemaManifest);
}

/** @param {URL | string} manifestUrl */
export async function readManifest(manifestUrl) {
  const raw = await readFile(manifestUrl, 'utf8');
  return JSON.parse(raw);
}

function isPrimaryModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isPrimaryModule()) {
  const manifestUrl = new URL('./generated/db.schema.json', import.meta.url);
  const manifest = await readManifest(manifestUrl);
  console.log(renderSchemaUiHtml(manifest));
}
