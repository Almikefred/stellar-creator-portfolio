import {
  graphql,
  isObjectType,
  type GraphQLFieldResolver,
  type GraphQLSchema,
} from 'graphql';
import { NextRequest, NextResponse } from 'next/server';
import { typeDefs } from '@/server/graphql/schema';
import { resolvers } from '@/server/graphql/resolvers';
import { createGraphQLContext } from '@/server/graphql/context';
import { checkRateLimit, RateLimitError } from '@/server/graphql/rate-limit';

let schema: GraphQLSchema;

function getSchema() {
  if (!schema) {
    // typeDefs is already a built GraphQLSchema (see graphql/schema.ts).
    const baseSchema = typeDefs;

    // Attach resolvers to the schema
    const resolverMap = resolvers as Record<string, Record<string, GraphQLFieldResolver<unknown, unknown>>>;
    for (const [typeName, fieldResolvers] of Object.entries(resolverMap)) {
      const type =
        typeName === 'Query'
          ? baseSchema.getQueryType()
          : typeName === 'Mutation'
            ? baseSchema.getMutationType()
            : baseSchema.getType(typeName);

      if (!isObjectType(type)) continue;

      const fields = type.getFields();
      for (const [fieldName, resolve] of Object.entries(fieldResolvers)) {
        if (fields[fieldName]) {
          fields[fieldName].resolve = resolve;
        }
      }
    }

    schema = baseSchema;
  }
  return schema;
}

async function handleGraphQLRequest(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const ctx = await createGraphQLContext(req);

    // Enforce the rate limit decided while building the context
    let remaining: number;
    try {
      remaining = checkRateLimit(ctx).remaining;
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { errors: [{ message: error.message }] },
          { status: 429, headers: { 'Retry-After': String(error.retryAfter) } }
        );
      }
      throw error;
    }

    const { query, variables, operationName } =
      req.method === 'GET'
        ? Object.fromEntries(new URL(req.url).searchParams)
        : await req.json();

    const result = await graphql({
      schema: getSchema(),
      source: query,
      variableValues: variables,
      operationName,
      contextValue: ctx,
    });

    const statusCode = result.errors ? 400 : 200;

    const headers: Record<string, string> = {};
    if (Number.isFinite(remaining)) {
      headers['X-RateLimit-Remaining'] = String(remaining);
      headers['X-RateLimit-Window'] = '60';
    }

    return NextResponse.json(result, { status: statusCode, headers });
  } catch (error) {
    console.error('GraphQL error:', error);
    return NextResponse.json(
      { errors: [{ message: error instanceof Error ? error.message : 'Internal server error' }] },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleGraphQLRequest(req);
}

export async function POST(req: NextRequest) {
  return handleGraphQLRequest(req);
}

export async function OPTIONS(req: NextRequest) {
  return handleGraphQLRequest(req);
}
