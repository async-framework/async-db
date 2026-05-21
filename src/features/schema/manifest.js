import path from 'node:path';
import { resolveFrom, writeText } from '../../fs-utils.js';
import { loadProjectSchema } from './project.js';

export async function generateSchemaManifest(config, options = {}) {
  const project = options.project ?? await loadProjectSchema(config);
  const manifest = renderSchemaManifest(project.resources, config);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const outFiles = outputFiles(config, options);

  for (const outFile of outFiles) {
    await writeText(outFile, content);
  }

  return {
    manifest,
    content,
    outFiles,
    diagnostics: project.diagnostics,
  };
}

export function renderSchemaManifest(resources, config = {}) {
  const diagnostics = [];
  const manifest = {
    version: 1,
    collections: {},
    documents: {},
  };

  for (const resource of resources) {
    const bucket = resource.kind === 'document' ? manifest.documents : manifest.collections;
    bucket[resource.name] = resourceManifest(resource, config, diagnostics);
  }

  if (diagnostics.length > 0) {
    throw manifestDiagnosticsError(diagnostics);
  }

  return manifest;
}

function outputFiles(config, options) {
  const outFile = options.outFile
    ? resolveFrom(config.cwd, options.outFile)
    : config.schemaOutFile;
  return outFile ? [outFile] : [];
}

function resourceManifest(resource, config, diagnostics) {
  const defaultManifest = {
    kind: resource.kind,
    name: resource.name,
    fields: renderFieldMap(resource.fields ?? {}, resource, config, diagnostics, ''),
  };

  if (resource.description) {
    defaultManifest.description = resource.description;
  }

  if (resource.kind === 'collection') {
    defaultManifest.idField = resource.idField;
  }

  return customizeResourceManifest(resource, config, diagnostics, defaultManifest);
}

function customizeResourceManifest(resource, config, diagnostics, defaultManifest) {
  const customizeResource = config.schemaManifest?.customizeResource;
  const sourceFile = resource.schemaPath ?? resource.dataPath ?? null;

  if (typeof customizeResource !== 'function') {
    return defaultManifest;
  }

  let customized;
  try {
    customized = customizeResource({
      resource,
      resourceName: resource.name,
      file: sourceFile ? path.relative(config.cwd, sourceFile) : null,
      sourceFile,
      defaultManifest: structuredClone(defaultManifest),
    });
  } catch (error) {
    diagnostics.push({
      code: 'SCHEMA_MANIFEST_RESOURCE_CUSTOMIZE_FAILED',
      severity: 'error',
      resource: resource.name,
      message: `Could not customize schema manifest resource "${resource.name}": ${error.message}`,
      hint: 'Update schemaManifest.customizeResource so it returns a JSON-serializable resource manifest.',
      details: {
        resource: resource.name,
      },
    });
    return defaultManifest;
  }

  const serializablePath = firstNonSerializablePath(customized);
  if (serializablePath) {
    diagnostics.push(nonSerializableResourceDiagnostic(resource, serializablePath));
    return defaultManifest;
  }

  return customized;
}

function renderFieldMap(fields, resource, config, diagnostics, parentPath) {
  const output = {};
  for (const [fieldName, field] of Object.entries(fields)) {
    const fieldPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
    const fieldManifest = renderFieldManifest(fieldName, field, resource, config, diagnostics, fieldPath);
    if (fieldManifest !== null) {
      output[fieldName] = fieldManifest;
    }
  }
  return output;
}

function renderFieldManifest(fieldName, field, resource, config, diagnostics, fieldPath) {
  const defaultManifest = defaultFieldManifest(fieldName, field, resource, config, diagnostics, fieldPath);
  const customizeField = config.schemaManifest?.customizeField;
  const sourceFile = resource.schemaPath ?? resource.dataPath ?? null;

  if (typeof customizeField !== 'function') {
    return defaultManifest;
  }

  let customized;
  try {
    customized = customizeField({
      field,
      fieldName,
      resource,
      resourceName: resource.name,
      path: fieldPath,
      file: sourceFile ? path.relative(config.cwd, sourceFile) : null,
      sourceFile,
      defaultManifest: structuredClone(defaultManifest),
    });
  } catch (error) {
    diagnostics.push({
      code: 'SCHEMA_MANIFEST_FIELD_CUSTOMIZE_FAILED',
      severity: 'error',
      resource: resource.name,
      field: fieldPath,
      message: `Could not customize schema manifest field "${resource.name}.${fieldPath}": ${error.message}`,
      hint: 'Update schemaManifest.customizeField so it returns a JSON-serializable field manifest or null.',
      details: {
        resource: resource.name,
        field: fieldPath,
      },
    });
    return defaultManifest;
  }

  if (customized === null) {
    return null;
  }

  const serializablePath = firstNonSerializablePath(customized);
  if (serializablePath) {
    diagnostics.push(nonSerializableDiagnostic(resource, fieldPath, serializablePath));
    return defaultManifest;
  }

  return customized;
}

function defaultFieldManifest(fieldName, field, resource, config, diagnostics, fieldPath) {
  const manifest = {
    type: field.type ?? 'unknown',
    required: Boolean(field.required),
    nullable: Boolean(field.nullable),
  };

  for (const property of [
    'description',
    'default',
    'computed',
    'readOnly',
    'values',
    'relation',
    'unique',
    'min',
    'max',
    'minLength',
    'maxLength',
    'pattern',
    'additionalProperties',
    'discriminator',
  ]) {
    if (property in field) {
      manifest[property] = structuredClone(field[property]);
    }
  }

  if (field.type === 'array') {
    manifest.items = itemManifest(field.items ?? { type: 'unknown' }, resource, config, diagnostics, fieldPath);
  }

  if (field.type === 'object' && field.fields && typeof field.fields === 'object') {
    manifest.fields = renderFieldMap(field.fields, resource, config, diagnostics, fieldPath);
  }

  if (field.type === 'object' && field.variants && typeof field.variants === 'object') {
    manifest.variants = variantManifestMap(field.variants, resource, config, diagnostics, fieldPath);
  }

  return manifest;
}

function itemManifest(field, resource, config, diagnostics, fieldPath) {
  const manifest = {
    type: field.type ?? 'unknown',
    required: Boolean(field.required),
    nullable: Boolean(field.nullable),
  };

  for (const property of [
    'description',
    'default',
    'values',
    'relation',
    'unique',
    'min',
    'max',
    'minLength',
    'maxLength',
    'pattern',
    'additionalProperties',
    'discriminator',
  ]) {
    if (property in field) {
      manifest[property] = structuredClone(field[property]);
    }
  }

  if (field.type === 'array') {
    manifest.items = itemManifest(field.items ?? { type: 'unknown' }, resource, config, diagnostics, fieldPath);
  }

  if (field.type === 'object' && field.fields && typeof field.fields === 'object') {
    manifest.fields = renderFieldMap(field.fields, resource, config, diagnostics, fieldPath);
  }

  if (field.type === 'object' && field.variants && typeof field.variants === 'object') {
    manifest.variants = variantManifestMap(field.variants, resource, config, diagnostics, fieldPath);
  }

  return manifest;
}

function variantManifestMap(variants, resource, config, diagnostics, fieldPath) {
  return Object.fromEntries(Object.entries(variants).map(([variantName, variant]) => {
    const manifest = {
      fields: renderFieldMap(variant.fields ?? {}, resource, config, diagnostics, `${fieldPath}.${variantName}`),
    };
    if ('additionalProperties' in variant) {
      manifest.additionalProperties = Boolean(variant.additionalProperties);
    }
    return [variantName, manifest];
  }));
}

function firstNonSerializablePath(value, currentPath = '') {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') {
    return null;
  }

  if (valueType === 'number') {
    return Number.isFinite(value) ? null : currentPath || '<root>';
  }

  if (valueType === 'undefined' || valueType === 'function' || valueType === 'symbol' || valueType === 'bigint') {
    return currentPath || '<root>';
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const childPath = firstNonSerializablePath(value[index], `${currentPath}[${index}]`);
      if (childPath) {
        return childPath;
      }
    }
    return null;
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return currentPath || '<root>';
    }

    for (const [key, childValue] of Object.entries(value)) {
      const childPath = firstNonSerializablePath(childValue, currentPath ? `${currentPath}.${key}` : key);
      if (childPath) {
        return childPath;
      }
    }
  }

  return null;
}

function nonSerializableDiagnostic(resource, fieldPath, serializablePath) {
  return {
    code: 'SCHEMA_MANIFEST_FIELD_NOT_SERIALIZABLE',
    severity: 'error',
    resource: resource.name,
    field: fieldPath,
    message: `schemaManifest.customizeField returned non-serializable output for "${resource.name}.${fieldPath}" at "${serializablePath}".`,
    hint: 'Return JSON-serializable values such as strings, numbers, booleans, arrays, plain objects, null, or return null to omit the field.',
    details: {
      resource: resource.name,
      field: fieldPath,
      path: serializablePath,
    },
  };
}

function nonSerializableResourceDiagnostic(resource, serializablePath) {
  return {
    code: 'SCHEMA_MANIFEST_RESOURCE_NOT_SERIALIZABLE',
    severity: 'error',
    resource: resource.name,
    message: `schemaManifest.customizeResource returned non-serializable output for "${resource.name}" at "${serializablePath}".`,
    hint: 'Return JSON-serializable values such as strings, numbers, booleans, arrays, plain objects, null, or omit the custom resource hook.',
    details: {
      resource: resource.name,
      path: serializablePath,
    },
  };
}

function manifestDiagnosticsError(diagnostics) {
  const error = new Error(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  error.diagnostics = diagnostics;
  return error;
}
