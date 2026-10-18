import {
  GraphQLError,
  Kind,
  NoSchemaIntrospectionCustomRule,
  getNamedType,
  getNullableType,
  isListType,
  isObjectType,
  isInterfaceType,
  specifiedRules,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLCompositeType,
  type GraphQLField,
  type GraphQLSchema,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationRule,
  type ValueNode,
} from 'graphql';

/** Maximum selection depth for any operation (issue #1560). */
export const MAX_QUERY_DEPTH = 8;
/** Maximum computed cost for any operation (issue #1560). */
export const MAX_QUERY_COST = 1000;
/** Multiplier used for list fields without a `take` argument. */
export const DEFAULT_LIST_SIZE = 10;
/** Upper bound on the multiplier from a client-supplied `take` argument. */
export const MAX_LIST_SIZE = 100;

/**
 * Introspection is disabled in production so the full schema isn't handed to
 * anyone who asks (issue #1561). Dev and staging keep it for tooling.
 * Deny-by-default: an explicit opt-in is needed to re-enable it in prod.
 */
export function isIntrospectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return env.GRAPHQL_INTROSPECTION === 'true';
}

/** Validation rules applied to every operation before execution. */
export function getValidationRules(env: NodeJS.ProcessEnv = process.env): ValidationRule[] {
  const rules = [...specifiedRules];
  if (!isIntrospectionEnabled(env)) rules.push(NoSchemaIntrospectionCustomRule);
  return rules;
}

export interface QueryComplexity {
  depth: number;
  cost: number;
}

type Fragments = Record<string, FragmentDefinitionNode>;

function listSize(
  field: GraphQLField<unknown, unknown> | undefined,
  args: readonly { name: { value: string }; value: ValueNode }[] | undefined,
  variables: Record<string, unknown>,
): number {
  const takeArg = args?.find((a) => a.name.value === 'take');
  let take: unknown;
  if (takeArg?.value.kind === Kind.INT) take = Number(takeArg.value.value);
  else if (takeArg?.value.kind === Kind.VARIABLE) take = variables[takeArg.value.name.value];
  else take = field?.args.find((a) => a.name === 'take')?.defaultValue;

  if (typeof take !== 'number' || !Number.isFinite(take) || take < 1) return DEFAULT_LIST_SIZE;
  return Math.min(Math.floor(take), MAX_LIST_SIZE);
}

function measureSelectionSet(
  selectionSet: SelectionSetNode,
  parentType: GraphQLCompositeType | undefined,
  schema: GraphQLSchema,
  fragments: Fragments,
  variables: Record<string, unknown>,
  visited: Set<string>,
  inConnection = false,
): QueryComplexity {
  let depth = 0;
  let cost = 0;

  for (const selection of selectionSet.selections) {
    let child: QueryComplexity;

    if (selection.kind === Kind.FIELD) {
      const name = selection.name.value;
      if (name === '__typename') continue;

      const fieldDef =
        parentType && (isObjectType(parentType) || isInterfaceType(parentType))
          ? parentType.getFields()[name]
          : undefined;
      const fieldType = fieldDef?.type;
      const namedType = fieldType ? getNamedType(fieldType) : undefined;

      // Paginated fields (`bounties(take:)`) return a connection whose inner list
      // is already bounded by `take`, so the multiplier is applied once, on the
      // field carrying the argument, not again on the connection's list.
      const nullable = fieldType ? getNullableType(fieldType) : undefined;
      const hasTake = fieldDef?.args.some((a) => a.name === 'take') ?? false;
      const isList = nullable ? isListType(nullable) : false;
      const multiplier =
        hasTake || (isList && !inConnection) ? listSize(fieldDef, selection.arguments, variables) : 1;

      if (selection.selectionSet) {
        const inner = measureSelectionSet(
          selection.selectionSet,
          namedType && (isObjectType(namedType) || isInterfaceType(namedType)) ? namedType : undefined,
          schema,
          fragments,
          variables,
          visited,
          hasTake && !isList,
        );
        child = { depth: inner.depth + 1, cost: 1 + multiplier * inner.cost };
      } else {
        // Scalar leaves are resolved from their parent object and cost nothing extra.
        child = { depth: 1, cost: 0 };
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const typeName = selection.typeCondition?.name.value;
      const fragType = typeName ? (schema.getType(typeName) as GraphQLCompositeType) : parentType;
      child = measureSelectionSet(selection.selectionSet, fragType, schema, fragments, variables, visited, inConnection);
    } else {
      const name = selection.name.value;
      const fragment = fragments[name];
      // Unknown or cyclic fragments are rejected by the standard validation rules.
      if (!fragment || visited.has(name)) continue;
      visited.add(name);
      const fragType = schema.getType(fragment.typeCondition.name.value) as GraphQLCompositeType;
      child = measureSelectionSet(fragment.selectionSet, fragType, schema, fragments, variables, visited, inConnection);
      visited.delete(name);
    }

    depth = Math.max(depth, child.depth);
    cost += child.cost;
  }

  return { depth, cost };
}

/**
 * Compute the selection depth and an estimated cost for the operation that
 * will run. Cost is 1 per object-typed field (scalars are free), with list / paginated fields
 * multiplying their sub-selection by `take` (or DEFAULT_LIST_SIZE).
 */
export function measureQuery(
  schema: GraphQLSchema,
  document: DocumentNode,
  operationName?: string | null,
  variables: Record<string, unknown> = {},
): QueryComplexity {
  const fragments: Fragments = {};
  const operations: OperationDefinitionNode[] = [];
  for (const def of document.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) fragments[def.name.value] = def;
    else if (def.kind === Kind.OPERATION_DEFINITION) operations.push(def);
  }

  // Measure the selected operation, or the worst one if it can't be determined.
  const targets = operationName
    ? operations.filter((op) => op.name?.value === operationName)
    : operations;

  let result: QueryComplexity = { depth: 0, cost: 0 };
  for (const op of targets) {
    const rootType =
      op.operation === 'mutation'
        ? schema.getMutationType()
        : op.operation === 'subscription'
          ? schema.getSubscriptionType()
          : schema.getQueryType();
    const m = measureSelectionSet(op.selectionSet, rootType ?? undefined, schema, fragments, variables, new Set());
    result = { depth: Math.max(result.depth, m.depth), cost: Math.max(result.cost, m.cost) };
  }
  return result;
}

/** Returns errors for operations exceeding MAX_QUERY_DEPTH or MAX_QUERY_COST. */
export function checkQueryLimits(
  schema: GraphQLSchema,
  document: DocumentNode,
  operationName?: string | null,
  variables: Record<string, unknown> = {},
  limits: { maxDepth?: number; maxCost?: number } = {},
): GraphQLError[] {
  const maxDepth = limits.maxDepth ?? MAX_QUERY_DEPTH;
  const maxCost = limits.maxCost ?? MAX_QUERY_COST;
  const { depth, cost } = measureQuery(schema, document, operationName, variables);
  const errors: GraphQLError[] = [];

  if (depth > maxDepth) {
    errors.push(
      new GraphQLError(`Query depth ${depth} exceeds the maximum allowed depth of ${maxDepth}.`, {
        extensions: { code: 'QUERY_TOO_DEEP', depth, maxDepth },
      }),
    );
  }
  if (cost > maxCost) {
    errors.push(
      new GraphQLError(`Query cost ${cost} exceeds the maximum allowed cost of ${maxCost}.`, {
        extensions: { code: 'QUERY_TOO_COMPLEX', cost, maxCost },
      }),
    );
  }
  return errors;
}
