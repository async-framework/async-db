import { defaultGeneratedSchemaMetadataContributors, generatedSchemaMetadata } from './metadata.js';

export function makeGeneratedSchema(resources, diagnostics = []) {
  const metadata = generatedSchemaMetadata(resources, diagnostics, defaultGeneratedSchemaMetadataContributors());

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    resources: Object.fromEntries(resources.map((resource) => [resource.name, serializeResource(resource)])),
    relations: resources.flatMap((resource) => resource.relations ?? []),
    ...metadata,
    diagnostics,
  };
}

function serializeResource(resource) {
  return {
    kind: resource.kind,
    typeName: resource.typeName,
    routePath: resource.routePath,
    idField: resource.kind === 'collection' ? resource.idField : undefined,
    description: resource.description,
    fields: resource.fields,
    relations: resource.relations,
    seed: resource.seed,
    source: {
      typeSource: resource.typeSource,
      dataPath: resource.dataPath,
      dataFormat: resource.dataFormat,
      dataHash: resource.dataHash,
      dataSource: resource.dataDerived ? resource.dataSourceFile : undefined,
      dataDerived: resource.dataDerived || undefined,
      dataDependencies: resource.dataDependencies,
      schemaPath: resource.schemaPath,
      schemaSource: resource.schemaDerived ? resource.schemaSource : undefined,
      schemaSourceFile: resource.schemaDerived ? resource.schemaSourceFile : undefined,
      schemaDerived: resource.schemaDerived || undefined,
      schemaDependencies: resource.schemaDependencies,
      generatedIds: resource.generatedIds,
    },
  };
}
