import { GraphQLContext } from './context';

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`);
    this.name = 'RateLimitError';
  }
}

/**
 * Enforces the rate-limit decision taken while building the GraphQL context.
 *
 * `createGraphQLContext` already consumed a token from the caller's bucket
 * (keyed by user id, API key id or IP) and stored the outcome on
 * `ctx.rateLimit`; this turns a denied outcome into a `RateLimitError` so
 * the route can answer 429 without charging the caller a second token.
 */
export function checkRateLimit(ctx: GraphQLContext): { remaining: number; resetAt: Date } {
  const result = ctx.rateLimit;
  if (!result) {
    return { remaining: Number.POSITIVE_INFINITY, resetAt: new Date() };
  }
  if (!result.allowed) {
    throw new RateLimitError(Math.max(1, result.retryAfter));
  }
  return { remaining: result.remaining, resetAt: new Date(result.resetAt) };
}
