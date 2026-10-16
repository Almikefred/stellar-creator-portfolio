/**
 * ConflictResolution — per-entity policy for reconciling an offline write
 * with the server's current state when a replayed `OfflineQueue` operation
 * comes back `409 Conflict`.
 *
 * See `docs/adr/0001-offline-conflict-resolution.md` for the full design
 * rationale. Summary:
 *
 *  - `last-write-wins`: the side with the newer `updatedAt` wins outright.
 *    Used for entities where a partial merge would be meaningless or unsafe
 *    (e.g. a status flag, a financial amount) — one write must fully
 *    supersede the other.
 *  - `merge`: field-level merge. Fields the client explicitly changed
 *    (`changedFields`) are kept from the local write; every other field
 *    takes the server's value. Used for entities made of several
 *    independent fields (e.g. a profile) where a user editing their bio
 *    offline shouldn't clobber someone else's avatar change.
 */

import { QueuedOperation } from '../types';

export type ConflictStrategy = 'last-write-wins' | 'merge';

/**
 * Entity name (see `entityFromEndpoint`) -> resolution strategy.
 * Unlisted entities default to `last-write-wins` (see `getConflictStrategy`)
 * since that's the safer default when an entity's merge semantics haven't
 * been explicitly decided.
 */
export const ENTITY_CONFLICT_POLICY: Record<string, ConflictStrategy> = {
  profile: 'merge',
  portfolio: 'merge',
  'portfolio-item': 'merge',
  settings: 'merge',
  rating: 'last-write-wins',
  review: 'last-write-wins',
  bounty: 'last-write-wins',
  escrow: 'last-write-wins',
  payment: 'last-write-wins',
};

const DEFAULT_STRATEGY: ConflictStrategy = 'last-write-wins';

/** Resolve the conflict strategy for a given entity name. */
export function getConflictStrategy(entity: string): ConflictStrategy {
  return ENTITY_CONFLICT_POLICY[entity] ?? DEFAULT_STRATEGY;
}

/**
 * Extract the entity name from a queued operation's REST endpoint, e.g.
 * `/api/v1/profile/42` -> `profile`, `/api/v1/portfolio-items/9` ->
 * `portfolio-item`. Falls back to the first path segment so an unmapped
 * endpoint still gets a (default) strategy instead of throwing.
 */
export function entityFromEndpoint(endpoint: string): string {
  const segments = endpoint
    .split('?')[0]
    .split('/')
    .filter((s) => s.length > 0 && s !== 'api' && !/^v\d+$/.test(s));

  const first = segments[0] ?? '';
  // Normalise a trailing "s" (portfolio-items -> portfolio-item) so plural
  // and singular route segments share one policy entry; `settings` is
  // deliberately left as-is since it has no singular form.
  if (first !== 'settings' && first.endsWith('s')) {
    return first.slice(0, -1);
  }
  return first;
}

/**
 * Resolve a conflict between the local (queued) payload and the server's
 * current representation of the same resource.
 *
 * - `last-write-wins`: compares `localUpdatedAt` (set by the caller when it
 *   enqueues the operation) against the server's `updatedAt`/`updated_at`.
 *   If the server is strictly newer, the server's value wins outright
 *   (dropping the local write); otherwise the local payload is sent as-is.
 * - `merge`: starts from the server's object and overlays only the fields
 *   named in `changedFields` (defaulting to every key present in the local
 *   payload when the caller didn't record which fields actually changed).
 */
export function resolveConflict<T extends Record<string, unknown>>(
  local: T,
  remote: T,
  strategy: ConflictStrategy,
  changedFields?: readonly string[],
): T {
  if (strategy === 'last-write-wins') {
    const localUpdatedAt = readTimestamp(local, 'localUpdatedAt') ?? readTimestamp(local, 'updatedAt');
    const remoteUpdatedAt = readTimestamp(remote, 'updatedAt') ?? readTimestamp(remote, 'updated_at');

    if (localUpdatedAt !== null && remoteUpdatedAt !== null && remoteUpdatedAt > localUpdatedAt) {
      return remote;
    }
    return local;
  }

  // merge
  const fields = changedFields ?? Object.keys(local);
  const merged: Record<string, unknown> = { ...remote };
  for (const field of fields) {
    if (field in local) {
      merged[field] = local[field];
    }
  }
  return merged as T;
}

function readTimestamp(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key];
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'number') {
    return value;
  }
  return null;
}

/**
 * Convenience wrapper for `NetworkProvider`'s replay loop: resolves a
 * conflict for a queued operation directly from the entity encoded in its
 * endpoint.
 */
export function resolveOperationConflict(
  op: Pick<QueuedOperation, 'endpoint' | 'payload' | 'changedFields' | 'localUpdatedAt'>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const entity = entityFromEndpoint(op.endpoint);
  const strategy = getConflictStrategy(entity);
  const local = { ...(op.payload ?? {}) } as Record<string, unknown>;
  if (op.localUpdatedAt && local.localUpdatedAt === undefined) {
    local.localUpdatedAt = op.localUpdatedAt;
  }
  return resolveConflict(local, remote, strategy, op.changedFields);
}
