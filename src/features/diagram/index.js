import { resolveFrom, writeText } from '../../fs-utils.js';
import { dbError } from '../../errors.js';
import { loadProjectSchema } from '../schema/project.js';
import { renderSchemaManifest } from '../schema/manifest.js';

const FORMAT_VALUES = new Set(['mermaid', 'json']);
const FIELD_MODE_VALUES = new Set(['compact', 'all', 'none']);

export async function generateDiagram(config, options = {}) {
  const project = options.project ?? await loadProjectSchema(config);
  const format = normalizeFormat(options.format ?? 'mermaid');
  const fields = normalizeFieldMode(options.fields ?? 'compact');
  const model = renderDiagramModel(project.resources, config, { fields });
  const content = format === 'json'
    ? `${JSON.stringify(model, null, 2)}\n`
    : renderMermaidDiagram(model);
  const outFiles = diagramOutputFiles(config, { ...options, format });

  for (const outFile of outFiles) {
    await writeText(outFile, content);
  }

  return {
    model,
    content,
    format,
    outFiles,
    diagnostics: project.diagnostics,
  };
}

export async function generateConfiguredDiagrams(config, options = {}) {
  const project = options.project ?? await loadProjectSchema(config);
  const model = renderDiagramModel(project.resources, config, { fields: 'compact' });
  const outFiles = [];

  if (config.outputs?.diagramMermaid) {
    await writeText(config.outputs.diagramMermaid, renderMermaidDiagram(model));
    outFiles.push(config.outputs.diagramMermaid);
  }

  if (config.outputs?.diagramModel) {
    await writeText(config.outputs.diagramModel, `${JSON.stringify(model, null, 2)}\n`);
    outFiles.push(config.outputs.diagramModel);
  }

  return {
    model,
    outFiles,
    diagnostics: project.diagnostics,
  };
}

export function renderDiagramModel(resources, config = {}, options = {}) {
  const fields = normalizeFieldMode(options.fields ?? 'compact');
  const schemaManifest = renderSchemaManifest(resources, config);
  const manifestResources = [
    ...resourceEntries(schemaManifest.collections),
    ...resourceEntries(schemaManifest.documents),
  ].sort(compareByName);
  const resourceMap = new Map(resources.map((resource) => [resource.name, resource]));
  const renderedResourceNames = new Set(manifestResources.map((resource) => resource.name));
  const modelResources = manifestResources.map((manifestResource) => {
    const sourceResource = resourceMap.get(manifestResource.name) ?? {};
    return {
      name: manifestResource.name,
      kind: manifestResource.kind,
      typeName: sourceResource.typeName ?? manifestResource.typeName ?? typeNameFromResourceName(manifestResource.name),
      ...(manifestResource.kind === 'collection' ? { idField: manifestResource.idField ?? sourceResource.idField ?? 'id' } : {}),
      fields: renderDiagramFields(manifestResource, fields),
    };
  });
  const relations = resources
    .flatMap((resource) => (resource.relations ?? []).map((relation) => diagramRelation(relation, schemaManifest)))
    .filter(Boolean)
    .filter((relation) => renderedResourceNames.has(relation.sourceResource) && renderedResourceNames.has(relation.targetResource))
    .sort((left, right) => (
      compareText(left.sourceResource, right.sourceResource)
      || compareText(left.name, right.name)
      || compareText(left.targetResource, right.targetResource)
      || compareText(left.sourceField, right.sourceField)
    ));

  return {
    kind: 'db.diagramModel',
    version: 1,
    resources: modelResources,
    relations,
  };
}

export function renderMermaidDiagram(model, options = {}) {
  const direction = options.direction ?? null;
  const lines = ['erDiagram'];

  if (direction) {
    lines.push(`  direction ${direction}`);
  }

  for (const resource of [...(model.resources ?? [])].sort(compareByName)) {
    const entityId = mermaidEntityId(resource.name);
    const alias = escapeMermaidLabel(resource.name);
    lines.push(`  ${entityId}["${alias}"] {`);
    for (const field of resource.fields ?? []) {
      lines.push(`    ${mermaidType(field.type)} ${mermaidAttributeName(field.name)}${field.key ? ` ${field.key}` : ''}`);
    }
    lines.push('  }');
  }

  for (const relation of [...(model.relations ?? [])].sort(compareRelations)) {
    const source = mermaidEntityId(relation.sourceResource);
    const target = mermaidEntityId(relation.targetResource);
    const cardinality = relation.required ? '}o--||' : '}o--o|';
    lines.push(`  ${source} ${cardinality} ${target} : "${escapeMermaidLabel(relation.name)}"`);
  }

  return `${lines.join('\n')}\n`;
}

function resourceEntries(bucket = {}) {
  return Object.entries(bucket)
    .filter(([, resource]) => resource && typeof resource === 'object')
    .map(([name, resource]) => ({ ...resource, name }));
}

function renderDiagramFields(resource, mode) {
  if (mode === 'none') {
    return [];
  }

  const idField = resource.kind === 'collection' ? resource.idField ?? 'id' : null;
  return Object.entries(resource.fields ?? {})
    .filter(([fieldName, field]) => mode === 'all' || fieldName === idField || Boolean(field.relation))
    .map(([fieldName, field]) => ({
      name: fieldName,
      type: field.type ?? 'unknown',
      required: Boolean(field.required),
      nullable: Boolean(field.nullable),
      ...(fieldName === idField ? { key: 'PK' } : {}),
      ...(field.relation ? { key: 'FK' } : {}),
      ...(!field.relation && fieldName !== idField && field.unique ? { key: 'UK' } : {}),
    }))
    .sort((left, right) => fieldSort(left, right, idField));
}

function diagramRelation(relation, schemaManifest) {
  const sourceResource = schemaManifest.collections?.[relation.sourceResource];
  const sourceField = sourceResource?.fields?.[relation.sourceField];
  if (!sourceResource || !sourceField) {
    return null;
  }

  return {
    name: relation.name,
    sourceResource: relation.sourceResource,
    sourceField: relation.sourceField,
    targetResource: relation.targetResource,
    targetField: relation.targetField,
    cardinality: relation.cardinality ?? 'one',
    required: Boolean(sourceField.required),
  };
}

function diagramOutputFiles(config, options) {
  const outFile = options.outFile
    ? resolveFrom(config.cwd, options.outFile)
    : configuredDiagramOutput(config, options.format);
  return outFile ? [outFile] : [];
}

function configuredDiagramOutput(config, format) {
  return format === 'json'
    ? config.outputs?.diagramModel
    : config.outputs?.diagramMermaid;
}

function normalizeFormat(value) {
  if (FORMAT_VALUES.has(value)) {
    return value;
  }

  throw dbError('DIAGRAM_UNKNOWN_FORMAT', `Unknown diagram format "${value}".`, {
    hint: 'Use --format mermaid or --format json.',
  });
}

function normalizeFieldMode(value) {
  if (FIELD_MODE_VALUES.has(value)) {
    return value;
  }

  throw dbError('DIAGRAM_UNKNOWN_FIELDS_MODE', `Unknown diagram fields mode "${value}".`, {
    hint: 'Use --fields compact, --fields all, or --fields none.',
  });
}

function fieldSort(left, right, idField) {
  if (left.name === idField) {
    return -1;
  }
  if (right.name === idField) {
    return 1;
  }
  return compareText(left.name, right.name);
}

function compareByName(left, right) {
  return compareText(left.name, right.name);
}

function compareRelations(left, right) {
  return (
    compareText(left.sourceResource, right.sourceResource)
    || compareText(left.name, right.name)
    || compareText(left.targetResource, right.targetResource)
    || compareText(left.sourceField, right.sourceField)
  );
}

function compareText(left, right) {
  return String(left).localeCompare(String(right));
}

function mermaidType(type) {
  const value = String(type ?? 'unknown').replace(/[^A-Za-z0-9_()[\]-]/g, '_');
  return /^[A-Za-z]/.test(value) ? value : `field_${value}`;
}

function mermaidAttributeName(name) {
  const value = String(name ?? 'field').replace(/[^A-Za-z0-9_*()[\]-]/g, '_');
  return /^[A-Za-z_*]/.test(value) ? value : `field_${value}`;
}

function mermaidEntityId(name) {
  const value = String(name ?? 'resource').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z]/.test(value) ? value : `resource_${value}`;
}

function escapeMermaidLabel(value) {
  return String(value).replaceAll('"', '\\"');
}

function typeNameFromResourceName(name) {
  const words = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join('') || 'Resource';
}
