import { describe, it, expect } from 'vitest';
import { parseArgs, runWithConcurrency } from '../scripts/backfill-embeddings.mjs';

describe('parseArgs', () => {
  it('defaults to no dry-run and concurrency 5', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, concurrency: 5 });
  });

  it('parses --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('parses --concurrency=N', () => {
    expect(parseArgs(['--concurrency=10']).concurrency).toBe(10);
  });

  it('ignores a non-numeric --concurrency and keeps the default', () => {
    expect(parseArgs(['--concurrency=nope']).concurrency).toBe(5);
  });

  it('parses --id=<id>', () => {
    expect(parseArgs(['--id=cp-123']).id).toBe('cp-123');
  });

  it('combines multiple flags', () => {
    expect(parseArgs(['--dry-run', '--concurrency=2', '--id=cp-9'])).toEqual({
      dryRun: true,
      concurrency: 2,
      id: 'cp-9',
    });
  });
});

describe('runWithConcurrency', () => {
  it('processes every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const seen: number[] = [];

    await runWithConcurrency(items, 3, async (item: number) => {
      seen.push(item);
    });

    expect(seen.slice().sort((a, b) => a - b)).toEqual(items);
  });

  it('never runs more than `concurrency` workers at once', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;

    await runWithConcurrency(items, 4, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
    });

    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('continues past a single item throwing, without losing the error', async () => {
    const items = [1, 2, 3];
    const errors: unknown[] = [];

    await runWithConcurrency(items, 1, async (item: number) => {
      try {
        if (item === 2) throw new Error('boom');
      } catch (err) {
        errors.push(err);
      }
    });

    expect(errors).toHaveLength(1);
  });
});
