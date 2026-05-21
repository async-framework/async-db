export function updateSourceMetadataResource(sourceMetadata, config, resource) {
  if (!resource.dataHash) {
    return;
  }

  const previous = sourceMetadata.resources[resource.name];
  const next = {
    path: resource.dataPath ? relativePath(config, resource.dataPath) : null,
    format: resource.dataFormat,
    hash: resource.dataHash,
    derived: resource.dataDerived === true ? true : undefined,
    source: resource.dataDerived === true ? resource.dataSourceFile : undefined,
    dependencies: resource.dataDependencies,
  };

  sourceMetadata.resources[resource.name] = {
    ...next,
    updatedAt: sameSource(previous, next) && previous.updatedAt
      ? previous.updatedAt
      : new Date().toISOString(),
  };
}

function sameSource(previous, next) {
  return previous?.path === next.path
    && previous?.format === next.format
    && previous?.hash === next.hash
    && previous?.derived === next.derived
    && previous?.source === next.source
    && JSON.stringify(previous?.dependencies ?? null) === JSON.stringify(next.dependencies ?? null);
}

function relativePath(config, filePath) {
  return filePath.startsWith(config.cwd) ? filePath.slice(config.cwd.length + 1).split('\\').join('/') : filePath;
}
