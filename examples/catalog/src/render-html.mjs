import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [products, categories, inventory] = await Promise.all([
  db.collection('products').all(),
  db.collection('categories').all(),
  db.collection('inventory').all(),
]);

const categoriesById = new Map(categories.map((category) => [category.id, category]));
const inventoryByProductId = groupBy(inventory, 'productId');
const productRows = products.map((product) => {
  const stockRows = inventoryByProductId.get(product.id) ?? [];
  const reserved = sum(stockRows, 'stockReserved');
  const onHand = sum(stockRows, 'stockOnHand');

  return {
    ...product,
    category: categoriesById.get(product.categoryId),
    available: Math.max(0, onHand - reserved),
    locations: stockRows.map((row) => row.location).join(', '),
  };
});

console.log(renderPage(productRows));

function renderPage(rows) {
  const activeCount = rows.filter((product) => product.status === 'active').length;
  const totalStock = rows.reduce((total, product) => total + product.available, 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Catalog Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-normal">Catalog Example</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-600">Products join to categories and inventory while images stay nested on each product.</p>
      </div>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="text-xs font-medium uppercase tracking-normal text-slate-500">active</div>
          <div class="mt-1 text-xl font-semibold">${activeCount}</div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="text-xs font-medium uppercase tracking-normal text-slate-500">available</div>
          <div class="mt-1 text-xl font-semibold">${totalStock}</div>
        </div>
      </div>
    </header>
    <section class="grid gap-4 md:grid-cols-2">
      ${rows.map(renderProductCard).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderProductCard(product) {
  const image = product.images?.find((item) => item.primary) ?? product.images?.[0];

  return `<article data-product="${escapeHtml(product.id)}" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex gap-4">
          <div class="flex h-20 w-24 shrink-0 items-center justify-center rounded-md bg-slate-100 px-2 text-center text-xs font-medium text-slate-500">${escapeHtml(image?.alt ?? 'Product image')}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-slate-950">${escapeHtml(product.name)}</h2>
                <p class="mt-1 text-xs text-slate-500">${escapeHtml(product.sku)}</p>
              </div>
              <span class="${statusClass(product.status)}">${escapeHtml(product.status)}</span>
            </div>
            <p class="mt-3 text-sm text-slate-600">${escapeHtml(product.category?.name ?? product.categoryId)}</p>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div><span class="block text-xs text-slate-500">price</span><strong>${formatMoney(product.priceCents)}</strong></div>
          <div><span class="block text-xs text-slate-500">available</span><strong>${product.available}</strong></div>
          <div><span class="block text-xs text-slate-500">locations</span><strong>${escapeHtml(product.locations || 'none')}</strong></div>
        </div>
        <div class="mt-4 flex flex-wrap gap-1.5">${(product.tags ?? []).map(renderTag).join('')}</div>
      </article>`;
}

function renderTag(tag) {
  return `<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">${escapeHtml(tag)}</span>`;
}

function statusClass(status) {
  return status === 'active'
    ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
    : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600';
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record[key]) ?? [];
    group.push(record);
    groups.set(record[key], group);
  }
  return groups;
}

function sum(records, key) {
  return records.reduce((total, record) => total + Number(record[key] ?? 0), 0);
}

function formatMoney(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(cents ?? 0) / 100);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
