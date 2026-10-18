import { Networks, StrKey, xdr } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contractNameForId, encodeContractArgs, getContractClient } from '@/lib/soroban/contract-clients';

const ESCROW_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
const OPTIONS = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  network: 'testnet',
};

describe('contract-clients', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_ESCROW_CONTRACT_ID', ESCROW_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps a configured contract id back to its name', () => {
    expect(contractNameForId(ESCROW_ID, 'testnet')).toBe('escrow');
    expect(contractNameForId(StrKey.encodeContract(Buffer.alloc(32, 9)), 'testnet')).toBeNull();
  });

  it('encodes arguments using the generated contract spec', () => {
    const [escrowId] = encodeContractArgs(ESCROW_ID, 'get_escrow', [7n], OPTIONS);
    expect(escrowId.switch()).toBe(xdr.ScValType.scvU64());
    expect(escrowId.u64().toBigInt()).toBe(7n);
  });

  it('rejects calls whose arity does not match the contract signature', () => {
    expect(() => encodeContractArgs(ESCROW_ID, 'get_escrow', [], OPTIONS)).toThrow(/expects 1 argument/);
  });

  it('rejects methods the contract does not expose', () => {
    expect(() => encodeContractArgs(ESCROW_ID, 'not_a_method', [], OPTIONS)).toThrow();
  });

  it('falls back to type inference for contracts without bindings', () => {
    const tokenId = StrKey.encodeContract(Buffer.alloc(32, 2));
    const [value] = encodeContractArgs(tokenId, 'balance', [5], OPTIONS);
    expect(value).toBeInstanceOf(xdr.ScVal);
  });

  it('refuses to build a client for an undeployed contract', () => {
    expect(() => getContractClient('governance', { ...OPTIONS, network: 'futurenet' })).toThrow(/no address on futurenet/);
  });

  it('builds a typed client for a configured contract', () => {
    const client = getContractClient('escrow', OPTIONS);
    expect(client.options.contractId).toBe(ESCROW_ID);
    expect(typeof client.get_escrow).toBe('function');
  });
});
