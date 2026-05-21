// @ts-check
import path from 'node:path';
import { defineConfig } from '@async/db/config';

export default defineConfig({
  dbDir: './db',
  outputs: {
    stateDir: './.db',
    types: './.db/types/index.ts',
  },
  types: {
    enabled: true,
  },
  sources: {
    derived: [
      {
        name: 'data-sources-index',
        resourceName: 'dataSources',
        dependsOn: 'data/*.json',
        async read({ files }) {
          return {
            kind: 'data',
            format: 'derived-json-index',
            data: await buildDataSources(files),
          };
        },
      },
      {
        name: 'docs-navigation',
        resourceName: 'docNavigation',
        dependsOn: ['content/docs/*.md', 'content/docs/**/*.md'],
        async read({ files }) {
          return {
            kind: 'data',
            format: 'derived-docs-navigation',
            data: await buildDocNavigation(files),
          };
        },
      },
      {
        name: 'docs-search',
        resourceName: 'docSearch',
        dependsOn: ['content/docs/*.md', 'content/docs/**/*.md'],
        async read({ files }) {
          return {
            kind: 'data',
            format: 'derived-docs-search',
            data: await buildDocSearch(files),
          };
        },
      },
      {
        name: 'blog-tags',
        resourceName: 'blogTags',
        dependsOn: 'content/blog/**/*.md',
        async read({ files }) {
          return {
            kind: 'data',
            format: 'derived-blog-tags',
            data: await buildBlogTags(files),
          };
        },
      },
      {
        name: 'blog-archive-months',
        resourceName: 'blogArchiveMonths',
        dependsOn: 'content/blog/**/*.md',
        async read({ files }) {
          return {
            kind: 'data',
            format: 'derived-blog-archive-months',
            data: await buildBlogArchiveMonths(files),
          };
        },
      },
    ],
  },
});

async function buildDataSources(files) {
  const records = [];

  for (const file of files) {
    const rows = JSON.parse(await file.readText());
    const fields = fieldsForRows(rows);
    const resource = path.basename(file.path, '.json');

    records.push({
      id: file.path.replace(/\.json$/, '').replaceAll('/', '_'),
      resource,
      path: file.path,
      recordCount: Array.isArray(rows) ? rows.length : 1,
      fields,
    });
  }

  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function fieldsForRows(rows) {
  const values = Array.isArray(rows) ? rows : [rows];
  const fields = new Set();

  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    for (const field of Object.keys(value)) {
      fields.add(field);
    }
  }

  return [...fields].sort();
}

async function buildDocNavigation(files) {
  const pages = await readMarkdownFiles(files);

  return pages
    .map((page) => ({
      id: page.routePath === '/' ? 'root' : page.routePath.slice(1).replaceAll('/', '-'),
      title: page.title,
      section: page.section,
      routePath: page.routePath,
      order: page.order,
    }))
    .sort((left, right) => left.order - right.order || left.routePath.localeCompare(right.routePath));
}

async function buildDocSearch(files) {
  const pages = await readMarkdownFiles(files);

  return pages
    .map((page) => ({
      id: page.routePath === '/' ? 'root' : page.routePath.slice(1).replaceAll('/', '-'),
      title: page.title,
      routePath: page.routePath,
      summary: page.description,
      keywords: uniqueWords(`${page.title} ${page.description} ${page.bodyMarkdown}`).slice(0, 12),
    }))
    .sort((left, right) => left.routePath.localeCompare(right.routePath));
}

async function buildBlogTags(files) {
  const posts = await readMarkdownFiles(files);
  const tags = new Map();

  for (const post of posts) {
    for (const tag of post.tags) {
      const entry = tags.get(tag) ?? {
        id: slugify(tag),
        tag,
        postCount: 0,
        postIds: [],
      };
      entry.postCount += 1;
      entry.postIds.push(post.id);
      tags.set(tag, entry);
    }
  }

  return [...tags.values()]
    .map((tag) => ({
      ...tag,
      postIds: tag.postIds.sort(),
    }))
    .sort((left, right) => left.tag.localeCompare(right.tag));
}

async function buildBlogArchiveMonths(files) {
  const posts = await readMarkdownFiles(files);
  const months = new Map();

  for (const post of posts) {
    const month = post.date.slice(0, 7);
    const entry = months.get(month) ?? {
      id: month,
      month,
      postCount: 0,
      postIds: [],
    };
    entry.postCount += 1;
    entry.postIds.push(post.id);
    months.set(month, entry);
  }

  return [...months.values()]
    .map((month) => ({
      ...month,
      postIds: month.postIds.sort(),
    }))
    .sort((left, right) => right.month.localeCompare(left.month));
}

async function readMarkdownFiles(files) {
  const records = [];

  for (const file of files) {
    const markdown = await file.readText();
    const record = parseMarkdownRecord(file.path, markdown);
    records.push(record);
  }

  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function parseMarkdownRecord(filePath, markdown) {
  const separator = '\n---\n';
  const separatorIndex = markdown.indexOf(separator);
  if (separatorIndex === -1) {
    throw new Error(`${filePath} needs frontmatter, a line with --- by itself, and body Markdown.`);
  }

  const metadata = parseFrontmatter(markdown.slice(0, separatorIndex));
  const bodyMarkdown = markdown.slice(separatorIndex + separator.length).trim();
  const routePath = routePathForMarkdownFile(filePath);
  const id = routePath === '/' ? 'home' : routePath.slice(1).replaceAll('/', '-');

  return {
    id,
    path: filePath,
    routePath,
    bodyMarkdown,
    title: metadata.title ?? id,
    description: metadata.description ?? '',
    section: metadata.section ?? 'General',
    order: Number(metadata.order ?? 1000),
    date: metadata.date ?? '1970-01-01',
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
  };
}

function parseFrontmatter(text) {
  const metadata = {};

  for (const line of text.split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      metadata[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((value) => value.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    metadata[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return metadata;
}

function routePathForMarkdownFile(filePath) {
  return `/${filePath
    .replace(/^content\/(?:docs|blog)\//, '')
    .replace(/\/index\.md$/, '')
    .replace(/\.md$/, '')}`;
}

function uniqueWords(text) {
  return [...new Set(text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3))].sort();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
