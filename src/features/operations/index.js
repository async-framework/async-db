import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseJsonc } from '../../jsonc.js';
import { resolveFrom, writeText } from '../../fs-utils.js';
import { canonicalOperation, normalizeOperationTemplate, stableStringify } from '../../shared/operations.js';

export function hashOperation(input) {
  return `sha256:${createHash('sha256').update(stableStringify(canonicalOperation(input))).digest('hex')}`;
}

export async function buildOperationManifest(config, options = {}) {
  const operations = await loadOperationSources(config, options);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const registryEntries = operations.map((operation) => {
    const normalized = normalizeOperationTemplate(operation);
    const hash = hashOperation(normalized);
    return [hash, {
      ...normalized,
      hash,
    }];
  });
  const registry = Object.fromEntries(registryEntries);
  const refs = {
    version: 1,
    kind: 'db.operationRefs',
    generatedAt,
    operations: Object.fromEntries(registryEntries.map(([hash, operation]) => [
      operation.name ?? hash,
      {
        name: operation.name ?? hash,
        hash,
      },
    ])),
  };
  const manifest = {
    version: 1,
    kind: 'db.operations',
    generatedAt,
    operations: registry,
  };

  const outFiles = [];
  const refsOutFiles = [];
  const outFile = outputPath(config, options.outFile ?? config.operations?.outFile);
  const refsOutFile = outputPath(config, options.refsOutFile ?? config.operations?.refsOutFile);
  if (outFile) {
    await writeText(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
    outFiles.push(outFile);
  }
  if (refsOutFile) {
    await writeText(refsOutFile, `${JSON.stringify(refs, null, 2)}\n`);
    refsOutFiles.push(refsOutFile);
  }

  return {
    manifest,
    refs,
    outFiles,
    refsOutFiles,
  };
}

async function loadOperationSources(config, options) {
  if (Array.isArray(options.operations)) {
    return options.operations;
  }

  const sourceDir = config.operations?.sourceDir;
  if (!sourceDir) {
    return [];
  }

  try {
    await mkdir(sourceDir, { recursive: true });
  } catch {
    return [];
  }

  const files = await listOperationFiles(sourceDir);
  const operations = [];
  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    const extension = path.extname(filePath);
    if (extension === '.json' || extension === '.jsonc') {
      const parsed = parseJsonc(text, filePath);
      operations.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      continue;
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const template = lines.find((line) => !line.startsWith('#'));
    if (template) {
      operations.push({
        name: operationNameFromFile(filePath),
        ...normalizeOperationTemplate(template),
      });
    }
  }
  return operations;
}

async function listOperationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listOperationFiles(filePath));
    } else if (/\.(jsonc?|rest|txt)$/i.test(entry.name)) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function operationNameFromFile(filePath) {
  const basename = path.basename(filePath).replace(/\.(jsonc?|rest|txt)$/i, '');
  return basename.replace(/(^|[-_])([a-z0-9])/gi, (_match, _separator, char) => char.toUpperCase());
}

function outputPath(config, value) {
  if (!value) {
    return null;
  }
  return resolveFrom(config.cwd, value);
}
