/**
 * Example-owned recursive admin UI renderer.
 *
 * async/db provides the model facts in the schema manifest. This file owns the
 * UI conventions under `schemaUi`, including hidden resources and component
 * choices.
 */

export function renderHomePage(manifest, recordsByCollection) {
  const collections = visibleCollections(manifest);
  const links = collections.map((resource) => {
    const count = recordsByCollection[resource.name]?.length ?? 0;
    return `<li><a href="/cms/${escapeHtml(resource.name)}">${escapeHtml(resourceTitle(resource))}</a> - ${count} record${count === 1 ? '' : 's'}</li>`;
  });

  return pageShell({
    title: 'Recursive Schema UI - home',
    body: `
    <h1>Recursive Schema UI example</h1>
    <p>This example treats <code>schemaUi</code> as app-owned metadata layered on top of async/db model facts.</p>
    <ul>${links.join('\n')}</ul>
    <p><a href="/templates">Static recursive templates</a> (no live data).</p>`,
  });
}

export function renderCollectionListPage(manifest, collectionName, records) {
  const resource = visibleCollection(manifest, collectionName);
  if (!resource) {
    return null;
  }

  const title = resourceTitle(resource);
  const rows = records.map((record) => {
    const id = record?.[resource.idField ?? 'id'];
    const label = pickListLabel(record, resource);
    return `<li><a href="/cms/${escapeHtml(collectionName)}/${encodeURIComponent(String(id))}">${escapeHtml(label)}</a> <small>(<code>${escapeHtml(String(id))}</code>)</small></li>`;
  });

  return pageShell({
    title: `Recursive Schema UI - ${title}`,
    body: `
    <p><a href="/">Home</a></p>
    <h1>${escapeHtml(title)}</h1>
    ${resourceDescription(resource)}
    <ul>${rows.join('\n')}</ul>`,
  });
}

export function renderRecordDetailPage(manifest, collectionName, record, recordsByCollection) {
  const resource = visibleCollection(manifest, collectionName);
  if (!resource || !record) {
    return null;
  }

  const title = resourceTitle(resource);
  const id = record[resource.idField ?? 'id'];
  const fields = Object.entries(resource.fields ?? {}).filter(([, field]) => field?.schemaUi?.hidden !== true);
  const viewBlocks = fields.map(([fieldName, field]) => renderFieldBlock({
    mode: 'view',
    resource,
    fieldName,
    field,
    pointer: pointerFor([fieldName]),
    value: record[fieldName],
    recordsByCollection,
  }));
  const editorBlocks = fields.map(([fieldName, field]) => renderFieldBlock({
    mode: 'editor',
    resource,
    fieldName,
    field,
    pointer: pointerFor([fieldName]),
    value: record[fieldName],
    recordsByCollection,
  }));

  return pageShell({
    title: `Recursive Schema UI - ${title} - ${id}`,
    body: `
    <p><a href="/">Home</a> / <a href="/cms/${escapeHtml(collectionName)}">${escapeHtml(title)}</a></p>
    <h1>${escapeHtml(pickListLabel(record, resource))}</h1>
    ${resourceDescription(resource)}
    <section class="cms-live-view">
      <h2>Rendered view</h2>
${viewBlocks.join('\n')}
    </section>
    <section class="cms-live-editor">
      <h2>Rendered editor</h2>
      <form method="post" action="/cms/${escapeHtml(collectionName)}/${encodeURIComponent(String(id))}" class="cms-editor-demo">
${editorBlocks.join('\n')}
        <p><button type="submit">Save existing record</button></p>
      </form>
    </section>`,
  });
}

export function renderTemplateCatalog(manifest) {
  const collections = visibleCollections(manifest);
  return pageShell({
    title: 'Recursive Schema UI - templates',
    body: `
    <h1>Recursive Schema UI Example</h1>
    <p>Static recursive templates generated from model metadata plus this example's <code>schemaUi</code> namespace.</p>
${collections.map((resource) => renderCollectionTemplate(resource)).join('\n')}`,
  });
}

export function parseSchemaUiFormBody(body, resource, existingRecord = {}) {
  const patch = structuredClone(existingRecord ?? {});
  for (const [pointer, rawValue] of bodyEntries(body)) {
    if (!isJsonPointer(pointer)) {
      continue;
    }

    const field = fieldForPointer(resource, pointer);
    if (!field || field.schemaUi?.hidden === true || isReadOnlyField(resource, pointer, field)) {
      continue;
    }

    setPointerValue(patch, pointer, coerceFormValue(rawValue, field));
  }
  return patch;
}

export async function saveSchemaUiRecord(db, manifest, collectionName, id, body) {
  const resource = visibleCollection(manifest, collectionName);
  if (!resource) {
    return null;
  }

  const collection = db.collection(collectionName);
  const existing = await collection.get(id);
  if (!existing) {
    return null;
  }

  const patch = parseSchemaUiFormBody(body, resource, existing);
  return collection.patch(id, patch);
}

export function visibleCollections(manifest) {
  return Object.values(manifest.collections ?? {})
    .filter((resource) => resource?.kind === 'collection' && resource.schemaUi?.hidden !== true);
}

function visibleCollection(manifest, collectionName) {
  const resource = manifest.collections?.[collectionName];
  return resource?.kind === 'collection' && resource.schemaUi?.hidden !== true ? resource : null;
}

function renderCollectionTemplate(resource) {
  const fields = Object.entries(resource.fields ?? {}).filter(([, field]) => field?.schemaUi?.hidden !== true);
  return `    <section data-resource="${escapeHtml(resource.name)}">
      <header>
        <h2>${escapeHtml(resourceTitle(resource))}</h2>
        ${resourceDescription(resource)}
      </header>
      <div class="cms-view">
        <h3>View template</h3>
${fields.map(([fieldName, field]) => renderFieldBlock({
    mode: 'view',
    resource,
    fieldName,
    field,
    pointer: pointerFor([fieldName]),
    value: undefined,
    recordsByCollection: {},
  })).join('\n')}
      </div>
      <form class="cms-editor">
        <h3>Editor template</h3>
${fields.map(([fieldName, field]) => renderFieldBlock({
    mode: 'editor',
    resource,
    fieldName,
    field,
    pointer: pointerFor([fieldName]),
    value: undefined,
    recordsByCollection: {},
  })).join('\n')}
      </form>
    </section>`;
}

function renderFieldBlock(context) {
  const component = componentForField(context.field, context.fieldName);
  const label = labelForField(context.field, context.fieldName);
  const inner = context.mode === 'view'
    ? renderViewField({ ...context, component })
    : renderEditorField({ ...context, component });

  return `      <div class="field-block" data-mode="${context.mode}" data-component="${escapeHtml(component)}" data-pointer="${escapeHtml(context.pointer)}">
        <label>${escapeHtml(label)}</label>
        ${inner}
      </div>`;
}

function renderViewField(context) {
  const { component, field, fieldName, pointer, value, recordsByCollection } = context;
  if (field.type === 'object') {
    return renderObjectFields('view', context);
  }
  if (field.type === 'array') {
    return renderArrayItems('view', context);
  }

  switch (component) {
    case 'email': {
      const text = scalarText(value);
      return `<a href="mailto:${escapeHtml(text)}">${escapeHtml(text)}</a>${hint(field)}`;
    }
    case 'markdown':
      return `<article data-markdown data-field="${escapeHtml(fieldName)}">${escapeHtml(scalarText(value))}</article>${hint(field)}`;
    case 'relationSelect':
      return `${relationAnchor(field, value, recordsByCollection)}${hint(field)}`;
    case 'checkbox':
      return `<span>${value === true ? 'true' : 'false'}</span>${hint(field)}`;
    case 'number':
    case 'datetime':
    case 'select':
    case 'segmented-control':
    case 'textarea':
    case 'text':
    default:
      if (isReadOnlyField(context.resource, pointer, field)) {
        return `<span><code>${escapeHtml(scalarText(value))}</code></span>${hint(field)}`;
      }
      return `<span>${escapeHtml(scalarText(value))}</span>${hint(field)}`;
  }
}

function renderEditorField(context) {
  const { component, field, fieldName, pointer, value, recordsByCollection } = context;
  if (field.type === 'object') {
    return renderObjectFields('editor', context);
  }
  if (field.type === 'array') {
    return renderArrayItems('editor', context);
  }
  if (isReadOnlyField(context.resource, pointer, field)) {
    return `<span><code>${escapeHtml(scalarText(value))}</code></span>${hint(field)}`;
  }

  const req = field.required ? 'required' : '';
  switch (component) {
    case 'email':
      return `<input type="email" name="${escapeHtml(pointer)}" value="${escapeHtml(scalarText(value))}" ${req}>${hint(field)}`;
    case 'textarea':
      return `<textarea name="${escapeHtml(pointer)}" rows="4" cols="48" ${req}>${escapeHtml(scalarText(value))}</textarea>${hint(field)}`;
    case 'markdown':
      return `<textarea name="${escapeHtml(pointer)}" rows="10" cols="48" data-editor="markdown" ${req}>${escapeHtml(scalarText(value))}</textarea>${hint(field)}`;
    case 'select':
      return `${selectInput(field, pointer, value)}${hint(field)}`;
    case 'segmented-control':
      return `${radioGroup(field, pointer, value)}${hint(field)}`;
    case 'relationSelect':
      return `${relationSelect(field, pointer, value, recordsByCollection)}${hint(field)}`;
    case 'checkbox':
      return `<input type="hidden" name="${escapeHtml(pointer)}" value="false"><input type="checkbox" name="${escapeHtml(pointer)}" value="true" ${value === true ? 'checked' : ''}>${hint(field)}`;
    case 'number':
      return `<input type="number" name="${escapeHtml(pointer)}" value="${escapeHtml(scalarText(value))}" ${req}>${hint(field)}`;
    case 'datetime':
      return `<input type="datetime-local" name="${escapeHtml(pointer)}" value="${escapeHtml(scalarText(value))}" ${req}>${hint(field)}`;
    case 'text':
    default:
      return `<input type="text" name="${escapeHtml(pointer)}" value="${escapeHtml(scalarText(value))}" ${req}>${hint(field)}`;
  }
}

function renderObjectFields(mode, context) {
  const entries = Object.entries(context.field.fields ?? {}).filter(([, field]) => field?.schemaUi?.hidden !== true);
  if (entries.length === 0) {
    return mode === 'view'
      ? `<pre>${escapeHtml(JSON.stringify(context.value ?? {}, null, 2))}</pre>${hint(context.field)}`
      : `<textarea name="${escapeHtml(context.pointer)}" rows="6" cols="48">${escapeHtml(JSON.stringify(context.value ?? {}, null, 2))}</textarea>${hint(context.field)}`;
  }

  return `<fieldset>
        <legend>${escapeHtml(labelForField(context.field, context.fieldName))}</legend>
${entries.map(([childName, childField]) => renderFieldBlock({
    mode,
    resource: context.resource,
    fieldName: childName,
    field: childField,
    pointer: joinPointer(context.pointer, childName),
    value: context.value?.[childName],
    recordsByCollection: context.recordsByCollection,
  })).join('\n')}
      </fieldset>${hint(context.field)}`;
}

function renderArrayItems(mode, context) {
  const items = Array.isArray(context.value) ? context.value : [];
  const itemField = context.field.items ?? { type: 'unknown' };
  const renderedItems = items.map((item, index) => {
    const pointer = joinPointer(context.pointer, String(index));
    if (itemField.type === 'object') {
      return `<fieldset class="array-item">
        <legend>${escapeHtml(labelForField(context.field, context.fieldName))} ${index + 1}</legend>
${Object.entries(itemField.fields ?? {}).filter(([, field]) => field?.schemaUi?.hidden !== true).map(([childName, childField]) => renderFieldBlock({
    mode,
    resource: context.resource,
    fieldName: childName,
    field: childField,
    pointer: joinPointer(pointer, childName),
    value: item?.[childName],
    recordsByCollection: context.recordsByCollection,
  })).join('\n')}
      </fieldset>`;
    }

    return renderFieldBlock({
      mode,
      resource: context.resource,
      fieldName: `${context.fieldName} ${index + 1}`,
      field: itemField,
      pointer,
      value: item,
      recordsByCollection: context.recordsByCollection,
    });
  });

  const empty = renderedItems.length === 0 ? '<p><small>No existing items.</small></p>' : '';
  return `<div class="array-field">${renderedItems.join('\n')}${empty}</div>${hint(context.field)}`;
}

function componentForField(field, fieldName) {
  if (typeof field.schemaUi?.component === 'string') {
    return field.schemaUi.component;
  }
  if (field.relation) {
    return 'relationSelect';
  }
  if (field.type === 'enum') {
    return 'select';
  }
  if (field.type === 'boolean') {
    return 'checkbox';
  }
  if (field.type === 'number') {
    return 'number';
  }
  if (field.type === 'datetime') {
    return 'datetime';
  }
  if (field.type === 'array' && field.items?.type === 'object') {
    return 'object-array';
  }
  if (field.type === 'array') {
    return 'array';
  }
  if (field.type === 'object') {
    return 'object';
  }
  if (/email/i.test(fieldName)) {
    return 'email';
  }
  return 'text';
}

function labelForField(field, fieldName) {
  return field.schemaUi?.label ?? labelFromFieldName(fieldName);
}

function selectInput(field, pointer, value) {
  const current = scalarText(value);
  const options = (Array.isArray(field.values) ? field.values : []).map((option) => (
    `<option value="${escapeHtml(String(option))}" ${current === String(option) ? 'selected' : ''}>${escapeHtml(String(option))}</option>`
  ));
  return `<select name="${escapeHtml(pointer)}">${options.join('\n')}</select>`;
}

function radioGroup(field, pointer, value) {
  const current = scalarText(value);
  const options = (Array.isArray(field.values) ? field.values : []).map((option) => (
    `<label><input type="radio" name="${escapeHtml(pointer)}" value="${escapeHtml(String(option))}" ${current === String(option) ? 'checked' : ''}> ${escapeHtml(String(option))}</label>`
  ));
  return `<fieldset>${options.join('<br>\n')}</fieldset>`;
}

function relationAnchor(field, foreignKey, recordsByCollection) {
  const keyText = scalarText(foreignKey);
  if (!field.relation?.to || keyText === '') {
    return `<span>${escapeHtml(keyText)}</span>`;
  }
  const label = relationDisplayLabel(field, foreignKey, recordsByCollection);
  const targetCollection = field.relation.to;
  return `<a href="/cms/${escapeHtml(targetCollection)}/${encodeURIComponent(keyText)}">${escapeHtml(label)}</a>`;
}

function relationSelect(field, pointer, selectedKey, recordsByCollection) {
  const targetCollection = field.relation?.to;
  const idField = field.relation?.toField ?? 'id';
  const rows = targetCollection ? recordsByCollection[targetCollection] ?? [] : [];
  const current = scalarText(selectedKey);
  const options = [`<option value="">Choose...</option>`].concat(rows.map((row) => {
    const id = row?.[idField];
    const label = row?.name ?? row?.email ?? row?.title ?? String(id ?? '');
    return `<option value="${escapeHtml(String(id ?? ''))}" ${String(id ?? '') === current ? 'selected' : ''}>${escapeHtml(String(label))}</option>`;
  }));
  return `<select name="${escapeHtml(pointer)}">${options.join('\n')}</select>`;
}

function relationDisplayLabel(field, foreignKey, recordsByCollection) {
  const targetCollection = field.relation?.to;
  const idField = field.relation?.toField ?? 'id';
  if (!targetCollection) {
    return scalarText(foreignKey);
  }
  const rows = recordsByCollection[targetCollection] ?? [];
  const match = rows.find((row) => String(row?.[idField] ?? '') === String(foreignKey ?? ''));
  if (!match) {
    return scalarText(foreignKey);
  }
  return String(match.name ?? match.email ?? match.title ?? foreignKey ?? '');
}

function fieldForPointer(resource, pointer) {
  const parts = parsePointer(pointer);
  let field = null;
  let fields = resource.fields ?? {};
  for (const part of parts) {
    if (/^\d+$/u.test(part)) {
      field = field?.items ?? null;
      fields = field?.fields ?? {};
      continue;
    }

    field = fields?.[part] ?? null;
    fields = field?.fields ?? {};
  }
  return field;
}

function isReadOnlyField(resource, pointer, field) {
  return field.readOnly === true || (resource.kind === 'collection' && pointer === pointerFor([resource.idField ?? 'id']));
}

function coerceFormValue(value, field) {
  if (field.type === 'boolean') {
    return value === 'true' || value === 'on' || value === true;
  }
  if (field.type === 'number') {
    return value === '' ? null : Number(value);
  }
  if (value === '' && field.nullable) {
    return null;
  }
  return String(value);
}

function bodyEntries(body) {
  if (body instanceof URLSearchParams) {
    return body.entries();
  }
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object') {
    return Object.entries(body);
  }
  return [];
}

function setPointerValue(target, pointer, value) {
  const parts = parsePointer(pointer);
  let current = target;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const last = index === parts.length - 1;
    if (last) {
      current[part] = value;
      return;
    }

    const nextPart = parts[index + 1];
    if (current[part] === undefined || current[part] === null) {
      current[part] = /^\d+$/u.test(nextPart) ? [] : {};
    }
    current = current[part];
  }
}

function parsePointer(pointer) {
  if (!isJsonPointer(pointer)) {
    return [];
  }
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function isJsonPointer(value) {
  return typeof value === 'string' && value.startsWith('/');
}

function pointerFor(parts) {
  return `/${parts.map(escapePointerPart).join('/')}`;
}

function joinPointer(pointer, part) {
  return `${pointer}/${escapePointerPart(part)}`;
}

function escapePointerPart(part) {
  return String(part).replaceAll('~', '~0').replaceAll('/', '~1');
}

function pickListLabel(record, resource) {
  if (!record || typeof record !== 'object') {
    return '';
  }
  const labelField = resource.schemaUi?.listLabelField;
  if (labelField && typeof record[labelField] === 'string') {
    return record[labelField];
  }
  if (typeof record.title === 'string') {
    return record.title;
  }
  if (typeof record.name === 'string') {
    return record.name;
  }
  const idField = resource.idField ?? 'id';
  return String(record[idField] ?? '');
}

function resourceTitle(resource) {
  return resource.schemaUi?.title ?? resource.schemaUi?.label ?? resource.name;
}

function resourceDescription(resource) {
  const description = resource.schemaUi?.description ?? resource.description ?? '';
  return description ? `<p>${escapeHtml(description)}</p>` : '';
}

function scalarText(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function hint(field) {
  return field.description ? `<small>${escapeHtml(field.description)}</small>` : '';
}

function labelFromFieldName(fieldName) {
  return String(fieldName)
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function pageShell({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.45; max-width: 58rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
    code { font-size: 0.9em; }
    section { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; }
    fieldset { margin: 1rem 0; border: 1px solid #ddd; padding: 1rem; }
    .field-block { margin: 1rem 0; }
    .field-block label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
    .field-block small { display: block; color: #555; margin-top: 0.25rem; }
    article[data-markdown] { white-space: pre-wrap; border-left: 3px solid #ccc; padding-left: 1rem; }
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
