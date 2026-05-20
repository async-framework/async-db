export async function resolveSelectedComputedFields(db, resource, records, fieldNames, options = {}) {
  const selected = [...new Set(fieldNames)]
    .filter((fieldName) => resource.fields?.[fieldName]?.computed)
    .filter((fieldName) => resource.resolvers?.fields?.[fieldName]);

  if (selected.length === 0 || records.length === 0) {
    return records;
  }

  const nextRecords = records.map((record) => record && typeof record === 'object' && !Array.isArray(record)
    ? { ...record }
    : record);
  const cache = options.cache ?? new Map();

  for (const fieldName of selected) {
    const resolver = resource.resolvers.fields[fieldName];
    if (typeof resolver.resolveMany === 'function') {
      const values = await resolver.resolveMany({
        records: nextRecords,
        db,
        resource,
        cache,
      });
      applyManyResolvedValues(nextRecords, resource, fieldName, values);
      continue;
    }

    if (typeof resolver.resolve === 'function') {
      for (const record of nextRecords) {
        record[fieldName] = await resolver.resolve({
          record,
          db,
          resource,
          cache,
        });
      }
    }
  }

  return nextRecords;
}

function applyManyResolvedValues(records, resource, fieldName, values) {
  if (Array.isArray(values)) {
    for (const [index, record] of records.entries()) {
      record[fieldName] = values[index];
    }
    return;
  }

  if (values instanceof Map) {
    for (const [index, record] of records.entries()) {
      const key = keyForRecord(record, resource, index);
      record[fieldName] = values.get(key) ?? values.get(String(key)) ?? values.get(index);
    }
    return;
  }

  if (values && typeof values === 'object') {
    for (const [index, record] of records.entries()) {
      const key = keyForRecord(record, resource, index);
      record[fieldName] = values[key] ?? values[String(key)] ?? values[index];
    }
  }
}

function keyForRecord(record, resource, index) {
  if (resource.kind === 'collection') {
    const idField = resource.idField ?? 'id';
    const id = record?.[idField];
    if (id !== undefined && id !== null && id !== '') {
      return id;
    }
  }

  return index;
}
