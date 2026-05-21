import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [orders, customers, payments, shipments] = await Promise.all([
  db.collection('orders').all(),
  db.collection('customers').all(),
  db.collection('payments').all(),
  db.collection('shipments').all(),
]);

const customersById = new Map(customers.map((customer) => [customer.id, customer]));
const paymentsByOrderId = groupBy(payments, 'orderId');
const shipmentsByOrderId = groupBy(shipments, 'orderId');

console.log(renderPage(orders.map((order) => ({
  ...order,
  customer: customersById.get(order.customerId),
  payments: paymentsByOrderId.get(order.id) ?? [],
  shipments: shipmentsByOrderId.get(order.id) ?? [],
}))));

function renderPage(ordersWithDetails) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ecommerce Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-6xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Ecommerce Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Orders join to customers, payments, and shipments while line items stay nested on the order.</p>
    </header>
    <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-100 text-left text-xs font-semibold uppercase tracking-normal text-slate-600">
          <tr><th class="px-4 py-3">Order</th><th class="px-4 py-3">Customer</th><th class="px-4 py-3">Total</th><th class="px-4 py-3">Payment</th><th class="px-4 py-3">Shipment</th><th class="px-4 py-3">Items</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${ordersWithDetails.map(renderOrderRow).join('\n          ')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function renderOrderRow(order) {
  const payment = order.payments[0];
  const shipment = order.shipments[0];

  return `<tr data-order="${escapeHtml(order.id)}" data-status="${escapeHtml(order.status)}">
            <td class="px-4 py-3 align-top"><strong class="text-slate-950">#${escapeHtml(order.orderNumber)}</strong><br><span class="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">${escapeHtml(order.status)}</span></td>
            <td class="px-4 py-3 align-top text-slate-700">${escapeHtml(order.customer?.name ?? order.customerId)}<br><span class="text-xs text-slate-500">${escapeHtml(order.customer?.email ?? '')}</span></td>
            <td class="px-4 py-3 align-top font-medium text-slate-950">${formatMoney(order.totals.totalCents, order.totals.currency)}</td>
            <td class="px-4 py-3 align-top text-slate-700">${escapeHtml(payment?.status ?? 'none')}<br><span class="text-xs text-slate-500">${payment ? formatMoney(payment.amountCents, payment.currency) : ''}</span></td>
            <td class="px-4 py-3 align-top text-slate-700">${escapeHtml(shipment?.status ?? 'none')}<br><span class="text-xs text-slate-500">${escapeHtml(shipment?.trackingNumber ?? '')}</span></td>
            <td class="px-4 py-3 align-top text-slate-700">${order.items.map((item) => `${escapeHtml(item.title)} x ${item.quantity}`).join('<br>')}</td>
          </tr>`;
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

function formatMoney(cents, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
