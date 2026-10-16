#!/usr/bin/env node
/**
 * scripts/backfill-embeddings.mjs
 *
 * Backfills search embeddings for every `CreatorProfile`, by (re)indexing
 * each one into Elasticsearch — the same embedding + indexing path
 * `onProfileChanged()` uses on every profile update (see
 * server/services/search.ts and app/api/onboarding/route.ts). Needed for:
 *  - Seeding the index the first time it's created.
 *  - Recovering from an ES outage/data loss without replaying every
 *    profile update that ever happened.
 *  - Re-embedding everyone after switching EMBED_MODEL (the dimension and
 *    semantics of the vector change, so old embeddings go stale).
 *
 * This is the "backfill command" from Issue #1619 — the complement to
 * `onProfileChanged()`, which keeps a single creator's embedding fresh as
 * they edit their profile but doesn't help with the cases above.
 *
 * Plain JS/CommonJS-free ESM, not TypeScript: this project has no
 * TS-executing devDependency (tsx/ts-node) and this script's `node
 * scripts/backfill-embeddings.mjs` invocation needs to run on plain
 * Node 20 (see .github/workflows/*.yml), which can't execute .ts files
 * directly. Its embedding-generation and index-mapping logic therefore
 * duplicates `generateEmbedding`/`ensureIndex` in
 * server/services/search.ts rather than importing them — keep the two in
 * sync by hand if either changes (env vars read, corpus text built, or the
 * ES mapping). A follow-up that adds tsx (or moves this behind a tiny
 * build step) could import the real functions and delete the duplication
 * here; out of scope for this change, which only needed a working CLI, not
 * a build-tooling migration.
 *
 * Usage:
 *   pnpm backfill:embeddings
 *   pnpm backfill:embeddings --dry-run        # log what would be indexed, index nothing
 *   pnpm backfill:embeddings --concurrency=10 # default 5
 *   pnpm backfill:embeddings --id=<creatorProfileId>  # backfill just one profile
 */

import { PrismaClient } from '@prisma/client';
import { Client as ElasticClient } from '@elastic/elasticsearch';

const ES_URL = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
const ES_INDEX = process.env.ELASTICSEARCH_CREATORS_INDEX ?? 'creators';
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? '';
const EMBED_ENDPOINT = process.env.EMBED_ENDPOINT ?? 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small';
const EMBED_DIMS = EMBED_MODEL === 'text-embedding-3-large' ? 3072 : 1536;

const prisma = new PrismaClient();

function getElasticClient() {
  const auth = process.env.ELASTICSEARCH_API_KEY
    ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
    : process.env.ELASTICSEARCH_USERNAME
      ? { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD ?? '' }
      : undefined;

  return new ElasticClient({
    node: ES_URL,
    auth,
    requestTimeout: 10_000,
    sniffOnStart: false,
    sniffOnConnectionFault: false,
    compression: true,
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  });
}

/** Mirrors server/services/search.ts's ensureIndex() — see module doc comment above. */
async function ensureIndex(es) {
  const exists = await es.indices.exists({ index: ES_INDEX });
  if (exists) {
    console.log(`[backfill-embeddings] Index '${ES_INDEX}' already exists`);
    return;
  }

  await es.indices.create({
    index: ES_INDEX,
    settings: {
      number_of_shards: 2,
      number_of_replicas: 1,
      analysis: {
        analyzer: {
          tech_analyzer: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'asciifolding', 'tech_synonyms', 'stop'],
          },
        },
        filter: {
          tech_synonyms: {
            type: 'synonym',
            synonyms: [
              'ui,ux,user interface,user experience,design',
              'frontend,front-end,client-side,react,nextjs,next.js',
              'backend,back-end,server-side,node,nodejs,express',
              'ml,machine learning,ai,artificial intelligence,deep learning',
              'smart contract,solidity,blockchain,web3,defi',
              'motion,animation,after effects,lottie,framer',
            ],
          },
        },
      },
    },
    mappings: {
      properties: {
        id: { type: 'keyword' },
        displayName: {
          type: 'text',
          analyzer: 'tech_analyzer',
          fields: { keyword: { type: 'keyword', ignore_above: 256 } },
        },
        bio: { type: 'text', analyzer: 'tech_analyzer' },
        discipline: { type: 'keyword', fields: { text: { type: 'text', analyzer: 'tech_analyzer' } } },
        skills: { type: 'keyword', fields: { text: { type: 'text', analyzer: 'tech_analyzer' } } },
        embedding: { type: 'dense_vector', dims: EMBED_DIMS, index: true, similarity: 'cosine' },
        updatedAt: { type: 'date' },
        verified: { type: 'boolean' },
        rating: { type: 'float' },
        completedProjects: { type: 'integer' },
        githubUrl: { type: 'keyword', index: false },
        linkedinUrl: { type: 'keyword', index: false },
      },
    },
  });

  console.log(`[backfill-embeddings] Created index '${ES_INDEX}' with ${EMBED_DIMS}-dim dense vector field`);
}

/** Mirrors server/services/search.ts's generateEmbedding() — see module doc comment above. */
async function generateEmbedding(text) {
  const normalised = text.trim().slice(0, 8192); // OpenAI max input

  if (!OPENAI_KEY) {
    console.warn('[backfill-embeddings] No OPENAI_API_KEY — using mock embedding');
    return Array.from({ length: EMBED_DIMS }, (_, i) => Math.sin((i + 1) * normalised.length * 0.01));
  }

  const res = await fetch(EMBED_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ input: normalised, model: EMBED_MODEL }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
}

/** Mirrors server/services/search.ts's buildEmbeddingCorpus(). */
function buildEmbeddingCorpus(doc) {
  return [doc.displayName, doc.discipline ?? '', doc.bio ?? '', doc.skills.join(', ')]
    .filter(Boolean)
    .join('. ');
}

export function parseArgs(argv) {
  const options = { dryRun: false, concurrency: 5 };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--concurrency=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) options.concurrency = n;
    } else if (arg.startsWith('--id=')) {
      options.id = arg.split('=')[1];
    }
  }
  return options;
}

/** Simple fixed-concurrency worker pool — avoids pulling in a queue library for a one-off CLI. */
export async function runWithConcurrency(items, concurrency, worker) {
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(
    options.dryRun
      ? '[backfill-embeddings] Dry run — no documents will be indexed.'
      : '[backfill-embeddings] Starting backfill...',
  );

  const es = options.dryRun ? null : getElasticClient();
  if (es) await ensureIndex(es);

  const profiles = await prisma.creatorProfile.findMany({
    where: options.id ? { id: options.id } : undefined,
    select: {
      id: true,
      displayName: true,
      bio: true,
      discipline: true,
      skills: true,
      githubUrl: true,
      linkedinUrl: true,
      verified: true,
      rating: true,
      completedProjects: true,
      updatedAt: true,
    },
  });

  if (profiles.length === 0) {
    console.log('[backfill-embeddings] No matching creator profiles found. Nothing to do.');
    return;
  }

  console.log(`[backfill-embeddings] Found ${profiles.length} creator profile(s).`);

  let succeeded = 0;
  let failed = 0;

  await runWithConcurrency(profiles, options.concurrency, async (profile) => {
    const doc = {
      id: profile.id,
      displayName: profile.displayName,
      bio: profile.bio,
      discipline: profile.discipline,
      skills: profile.skills,
      githubUrl: profile.githubUrl,
      linkedinUrl: profile.linkedinUrl,
      verified: profile.verified,
      rating: profile.rating,
      completedProjects: profile.completedProjects,
      updatedAt: profile.updatedAt.toISOString(),
    };

    if (options.dryRun) {
      console.log(`[backfill-embeddings] (dry run) would index ${doc.id} — ${doc.displayName}`);
      succeeded++;
      return;
    }

    try {
      const embedding = await generateEmbedding(buildEmbeddingCorpus(doc));
      await es.index({
        index: ES_INDEX,
        id: doc.id,
        document: { ...doc, embedding },
        refresh: false,
      });
      succeeded++;
    } catch (err) {
      failed++;
      console.error(`[backfill-embeddings] Failed to index ${doc.id} (${doc.displayName}):`, err);
    }
  });

  console.log(`[backfill-embeddings] Done. ${succeeded} succeeded, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

// Only run when executed directly (`node scripts/backfill-embeddings.mjs` /
// `pnpm backfill:embeddings`), not when imported by its own tests for
// `parseArgs`/`runWithConcurrency`.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .catch((err) => {
      console.error('[backfill-embeddings] Fatal error:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
