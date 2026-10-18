import { PrismaClient } from '@prisma/client';
import { createPrismaTracingMiddleware } from '@/server/services/tracing';

function buildPrismaClient(): PrismaClient {
  // When PgBouncer is in use, DATABASE_URL points to the pooler (port 6432).
  // We pass it explicitly so Prisma uses the pooler URL at runtime.
  // DIRECT_DATABASE_URL is used by Prisma Migrate (set in schema.prisma directUrl).
  //
  // The override is only applied when the variable is set: passing
  // `url: undefined` makes the constructor throw at import time, which
  // breaks `next build` and any test that merely imports a route module.
  // Without it Prisma reads env("DATABASE_URL") itself and reports a
  // missing URL on first query instead.
  const url = process.env.DATABASE_URL;
  const client = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  // Attach OpenTelemetry tracing middleware — creates a child span per DB query
  client.$use(createPrismaTracingMiddleware());
  return client;
}

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = buildPrismaClient();
} else {
  const globalWithPrisma = global as typeof global & {
    prisma: PrismaClient;
  };
  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = buildPrismaClient();
  }
  prisma = globalWithPrisma.prisma;
}

export { prisma };
