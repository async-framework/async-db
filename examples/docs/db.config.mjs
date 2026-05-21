// @ts-check
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from '@async/db/config';

export default defineConfig({
  dbDir: './db',
  resources: {
    docs: {
      store: 'static',
    },
  },
  outputs: {
    stateDir: './.db',
    types: './.db/types/index.ts',
  },
  types: {
    enabled: true,
  },
  sources: {
    readers: [
      {
        name: 'docs-markdown',
        match({ file }) {
          return file === 'db/docs/index.md';
        },
        async read({ config }) {
          return {
            kind: 'data',
            resourceName: 'docs',
            format: 'markdown-tree',
            data: await readDocsMarkdownTree(path.join(config.sourceDir, 'docs')),
          };
        },
      },
    ],
  },
});

async function readDocsMarkdownTree(rootDir) {
  const files = await listMarkdownFiles(rootDir);
  const records = [];

  for (const filePath of files) {
    const relativeFile = toPosixPath(path.relative(rootDir, filePath));
    records.push(parseDocFile(relativeFile, await readFile(filePath, 'utf8')));
  }

  return records.sort((left, right) => {
    const leftOrder = typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.sourcePath.localeCompare(right.sourcePath);
  });
}

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(filePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(filePath);
    }
  }

  return files.sort();
}

function parseDocFile(relativeFile, markdown) {
  const separator = '\n---\n';
  const separatorIndex = markdown.indexOf(separator);
  if (separatorIndex === -1) {
    throw new Error(`Markdown file ${relativeFile} needs metadata, a line with --- by itself, and body Markdown.`);
  }

  const metadata = parseMetadata(markdown.slice(0, separatorIndex));
  const bodyMarkdown = markdown.slice(separatorIndex + separator.length).trim();
  const routePath = routePathForMarkdownFile(relativeFile);
  const fallbackId = routePath.slice(1).replaceAll('/', '-') || 'index';

  return {
    id: metadata.id ?? fallbackId,
    slug: metadata.slug ?? routePath,
    section: metadata.section ?? sectionFromPath(relativeFile),
    sourcePath: `docs/${relativeFile}`,
    routePath,
    ...metadata,
    bodyMarkdown,
  };
}

function parseMetadata(block) {
  const out = {};
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid metadata line: ${trimmed}`);
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    out[key] = parseMetadataValue(value);
  }
  return out;
}

function parseMetadataValue(value) {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (/^-?\d+$/u.test(value)) {
    return Number(value);
  }
  if (value.includes(',')) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

function routePathForMarkdownFile(relativeFile) {
  const withoutExtension = relativeFile.replace(/\.md$/u, '');
  if (withoutExtension === 'index') {
    return '/';
  }
  if (withoutExtension.endsWith('/index')) {
    return `/${withoutExtension.slice(0, -'/index'.length)}`;
  }
  return `/${withoutExtension}`;
}

function sectionFromPath(relativeFile) {
  const [folder] = relativeFile.split('/');
  return folder === relativeFile ? 'overview' : folder;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}
