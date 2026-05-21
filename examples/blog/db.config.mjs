// @ts-check
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from '@async/db/config';

export default defineConfig({
  dbDir: './db',
  resources: {
    posts: {
      store: 'static',
    },
  },
  outputs: {
    stateDir: './.db',
    types: './.db/types/index.ts',
  },
  types: {
    enabled: true,
    emitComments: true,
  },
  sources: {
    readers: [
      {
        name: 'blog-posts-markdown',
        async match({ file, config }) {
          if (!file.startsWith('db/posts/') || !file.endsWith('.md')) {
            return false;
          }

          return file === await firstMarkdownSourceFile(config, 'posts');
        },
        async read({ config }) {
          return {
            kind: 'data',
            resourceName: 'posts',
            format: 'blog-markdown-tree',
            data: await readBlogPostMarkdownTree(path.join(config.sourceDir, 'posts')),
          };
        },
      },
    ],
  },
});

async function firstMarkdownSourceFile(config, folder) {
  const files = await listMarkdownFiles(path.join(config.sourceDir, folder));
  if (files.length === 0) {
    return null;
  }

  return `db/${folder}/${toPosixPath(path.relative(path.join(config.sourceDir, folder), files[0]))}`;
}

async function readBlogPostMarkdownTree(rootDir) {
  const files = await listMarkdownFiles(rootDir);
  const records = [];

  for (const filePath of files) {
    const relativeFile = toPosixPath(path.relative(rootDir, filePath));
    records.push(parsePostFile(relativeFile, await readFile(filePath, 'utf8')));
  }

  return records;
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

function parsePostFile(relativeFile, markdown) {
  const separator = '\n---\n';
  const separatorIndex = markdown.indexOf(separator);
  if (separatorIndex === -1) {
    throw new Error(`Markdown file ${relativeFile} needs metadata, a line with --- by itself, and body Markdown.`);
  }

  const metadata = parseMetadata(markdown.slice(0, separatorIndex));
  const bodyMarkdown = markdown.slice(separatorIndex + separator.length).trim();
  const slug = metadata.slug ?? path.basename(relativeFile, '.md');
  const datePath = datePathFromPostFile(relativeFile);
  const status = metadata.status ?? 'draft';
  const fallbackId = `post-${slug.replaceAll('/', '-')}`;

  return {
    id: metadata.id ?? fallbackId,
    slug,
    status,
    sourcePath: `posts/${relativeFile}`,
    datePath,
    ...metadata,
    publishedAt: metadata.publishedAt !== undefined
      ? metadata.publishedAt
      : publishedAtFromDatePath(datePath, status),
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
  if (value.startsWith('{') || value.startsWith('[')) {
    return JSON.parse(value);
  }
  if (value.includes(',')) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

function datePathFromPostFile(relativeFile) {
  const [year, month, day] = relativeFile.split('/');
  if (/^\d{4}$/u.test(year) && /^\d{2}$/u.test(month) && /^\d{2}$/u.test(day)) {
    return `${year}-${month}-${day}`;
  }
  return null;
}

function publishedAtFromDatePath(datePath, status) {
  if (!datePath || status !== 'published') {
    return null;
  }
  return `${datePath}T12:00:00.000Z`;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}
