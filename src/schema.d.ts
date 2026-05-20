export type FieldDefinition =
  | ({ type: 'string' } & FieldOptions<string>)
  | ({ type: 'datetime' } & FieldOptions<string>)
  | ({ type: 'number' } & FieldOptions<number>)
  | ({ type: 'boolean' } & FieldOptions<boolean>)
  | ({ type: 'enum'; values: readonly (string | number | boolean)[] } & FieldOptions<string | number | boolean>)
  | ({ type: 'object'; fields?: Record<string, FieldDefinition>; additionalProperties?: boolean } & FieldOptions<Record<string, unknown>>)
  | ({ type: 'array'; items?: FieldDefinition } & FieldOptions<unknown[]>)
  | ({ type: 'unknown' } & FieldOptions<unknown>);

export type FieldOptions<DefaultValue> = {
  required?: boolean;
  nullable?: boolean;
  description?: string;
  default?: DefaultValue;
  computed?: boolean;
  readOnly?: boolean;
  relation?: RelationDefinition;
  unique?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

export type RelationDefinition = {
  /** Output name used by REST expand, such as "author" for authorId. */
  name?: string;
  /** Target collection resource name. */
  to: string;
  /** Target collection field. Defaults to "id". */
  toField?: string;
  /** MVP supports explicit to-one expansion. */
  cardinality?: 'one' | 'many';
};

export type ObjectFieldOptions = FieldOptions<Record<string, unknown>> & {
  additionalProperties?: boolean;
};

export type ResourceDefinition = {
  description?: string;
  idField?: string;
  fields: Record<string, FieldDefinition>;
  seed?: unknown;
};

export type ComputedFieldResolver<RecordValue = Record<string, unknown>, Value = unknown> = {
  resolve?: (context: {
    record: RecordValue;
    db: unknown;
    resource: ResourceDefinition & { kind?: 'collection' | 'document' };
    cache: Map<string, unknown>;
  }) => Value | Promise<Value>;
  resolveMany?: (context: {
    records: RecordValue[];
    db: unknown;
    resource: ResourceDefinition & { kind?: 'collection' | 'document' };
    cache: Map<string, unknown>;
  }) => Map<string | number, Value> | Value[] | Record<string, Value> | Promise<Map<string | number, Value> | Value[] | Record<string, Value>>;
};

export function collection(definition: ResourceDefinition): ResourceDefinition & { kind: 'collection' };
export function document(definition: ResourceDefinition): ResourceDefinition & { kind: 'document' };

export const field: {
  string(options?: FieldOptions<string>): FieldDefinition;
  datetime(options?: FieldOptions<string>): FieldDefinition;
  number(options?: FieldOptions<number>): FieldDefinition;
  boolean(options?: FieldOptions<boolean>): FieldDefinition;
  enum<const Values extends readonly (string | number | boolean)[]>(
    values: Values,
    options?: FieldOptions<Values[number]>,
  ): FieldDefinition;
  object(fields?: Record<string, FieldDefinition>, options?: ObjectFieldOptions): FieldDefinition;
  array(items?: FieldDefinition, options?: FieldOptions<unknown[]>): FieldDefinition;
  json(options?: FieldOptions<unknown>): FieldDefinition;
  nullable(definition: FieldDefinition, options?: Omit<FieldOptions<unknown>, 'nullable'>): FieldDefinition;
  computed(definition: FieldDefinition, resolver?: ComputedFieldResolver): FieldDefinition;
};
