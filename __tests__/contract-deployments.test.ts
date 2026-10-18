import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_NAMES, getContractId, getDeploymentManifest } from '@/lib/contracts/deployments';

const DEPLOYMENTS_DIR = path.resolve(__dirname, '../deployments');

describe('deployments/*.json manifests', () => {
  const files = readdirSync(DEPLOYMENTS_DIR).filter((f) => f.endsWith('.json'));

  it.each(files)('%s matches the manifest schema', (file) => {
    const manifest = JSON.parse(readFileSync(path.join(DEPLOYMENTS_DIR, file), 'utf8'));

    expect(manifest.network).toBe(path.basename(file, '.json'));
    expect(manifest.gitSha === null || /^[0-9a-f]{7,40}$/.test(manifest.gitSha)).toBe(true);
    expect(manifest.deployedAt === null || !Number.isNaN(Date.parse(manifest.deployedAt))).toBe(true);
    for (const [name, entry] of Object.entries<{ id: string; wasmHash: string }>(manifest.contracts)) {
      expect(CONTRACT_NAMES).toContain(name);
      expect(entry.id).toMatch(/^C[A-Z2-7]{55}$/);
      expect(entry.wasmHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('getContractId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null for a network without a committed manifest', () => {
    expect(getDeploymentManifest('futurenet')).toBeNull();
    expect(getContractId('bounty', 'futurenet')).toBeNull();
  });

  it('reads the id from the testnet manifest', () => {
    const manifest = getDeploymentManifest('testnet');
    expect(getContractId('escrow', 'testnet')).toBe(manifest?.contracts.escrow?.id ?? null);
  });

  it('prefers the NEXT_PUBLIC_*_CONTRACT_ID override', () => {
    const id = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    vi.stubEnv('NEXT_PUBLIC_BOUNTY_CONTRACT_ID', id);
    expect(getContractId('bounty', 'testnet')).toBe(id);
    expect(getContractId('bounty', 'futurenet')).toBe(id);
  });
});
