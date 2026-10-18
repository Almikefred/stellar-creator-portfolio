import {GovernanceConfig, Proposal, ExecutionTimelock, TokenVote, ProposalParam} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address} from '@stellar/stellar-sdk';

export interface Client {
  vote(args: { voter: string | Address; proposal_id: bigint; vote_yes: boolean }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<GovernanceConfig>>;
  get_proposal(args: { proposal_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Proposal>>;
  /**
   * Retrieve the execution timelock for a queued proposal.
   */
  get_timelock(args: { proposal_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<ExecutionTimelock>>;
  /**
   * Cast a token-weighted vote on a proposal.
   *
   * `token_weight` is the caller's token balance used as vote weight.  The
   * contract accumulates weighted tallies (`yes_votes` / `no_votes`) so that
   * large token holders have proportionally more influence.
   */
  vote_weighted(args: { voter: string | Address; proposal_id: bigint; vote_yes: boolean; token_weight: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Retrieve the weighted vote record for a specific voter on a proposal.
   */
  get_token_vote(args: { proposal_id: bigint; voter: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<TokenVote>>;
  create_proposal(args: { proposer: string | Address; title: string; description: string; voting_period: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Queue an approved proposal for timelocked execution.
   *
   * `timelock_delay` is in seconds.  The proposal must already be in
   * "approved" status (i.e. `execute_proposal` has been called).
   */
  queue_execution(args: { proposal_id: bigint; timelock_delay: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  execute_proposal(args: { proposal_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  set_platform_fee(args: { admin: string | Address; fee_percent: number }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  set_bounty_limits(args: { admin: string | Address; min_budget: bigint; max_budget: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Execute a timelocked proposal after its delay has elapsed.
   *
   * If the proposal carries a `ProposalParam` (stored via
   * `create_param_proposal`), the governance config is updated on-chain.
   */
  execute_timelocked(args: { proposal_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Create a proposal that carries an on-chain parameter change.
   *
   * Combines `create_proposal` with attaching a `ProposalParam` so that
   * on approval + timelock expiry the config updates atomically without any
   * further admin transaction.
   */
  create_param_proposal(args: { proposer: string | Address; title: string; description: string; voting_period: bigint; param: ProposalParam }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAQAAAAhQcm9wb3NhbAAAAAAAAAAIUHJvcG9zYWwAAAAJAAAAAAAAAApjcmVhdGVkX2F0AAAAAAAGAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAIbm9fdm90ZXMAAAAGAAAAAAAAAAhwcm9wb3NlcgAAABMAAAAAAAAABnN0YXR1cwAAAAAAEAAAAAAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAA92b3RpbmdfZGVhZGxpbmUAAAAABgAAAAAAAAAJeWVzX3ZvdGVzAAAAAAAABg==", "AAAAAQAAAO1XZWlnaHRlZCB2b3RlIGNhc3QgYnkgYSB0b2tlbiBob2xkZXIuCgpgd2VpZ2h0YCBpcyB0aGUgdm90ZXIncyB0b2tlbiBiYWxhbmNlIGF0IHZvdGUgdGltZSwgZXhwcmVzc2VkIGluIHRoZQp0b2tlbidzIHNtYWxsZXN0IGRlbm9taW5hdGlvbi4gIENhbGxlcnMgc3VwcGx5IHRoaXMgdmFsdWU7IGEgcHJvZHVjdGlvbgpkZXBsb3ltZW50IHdvdWxkIHJlYWQgaXQgZnJvbSBhbiBvbi1jaGFpbiB0b2tlbiBjb250cmFjdC4AAAAAAAAAAAAACVRva2VuVm90ZQAAAAAAAAQAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAYAAAAAAAAACHZvdGVfeWVzAAAAAQAAAAAAAAAFdm90ZXIAAAAAAAATAAAAAAAAAAZ3ZWlnaHQAAAAAAAY=", "AAAAAQAAARFPcHRpb25hbCBvbi1jaGFpbiBwYXJhbWV0ZXIgY2hhbmdlIGF0dGFjaGVkIHRvIGEgcHJvcG9zYWwuCgpXaGVuIGEgcHJvcG9zYWwgY2FycmllcyBhIGBQcm9wb3NhbFBhcmFtYCwgYGV4ZWN1dGVfdGltZWxvY2tlZGAgYXBwbGllcwp0aGUgY2hhbmdlIGRpcmVjdGx5IHRvIHRoZSBnb3Zlcm5hbmNlIGNvbmZpZywgY3JlYXRpbmcgYSBmdWxseSBvbi1jaGFpbgpwYXJhbWV0ZXItdXBkYXRlIGZsb3cgd2l0aG91dCByZXF1aXJpbmcgYSBzZXBhcmF0ZSBhZG1pbiB0cmFuc2FjdGlvbi4AAAAAAAAAAAAADVByb3Bvc2FsUGFyYW0AAAAAAAADAAAANE5ldyBwbGF0Zm9ybSBmZWUgaW4gYmFzaXMgcG9pbnRzIChOb25lID0gbm8gY2hhbmdlKS4AAAAOdGFyZ2V0X2ZlZV9icHMAAAAAA+gAAAAEAAAALU5ldyBtYXhpbXVtIGJvdW50eSBidWRnZXQgKE5vbmUgPSBubyBjaGFuZ2UpLgAAAAAAABF0YXJnZXRfbWF4X2J1ZGdldAAAAAAAA+gAAAALAAAALU5ldyBtaW5pbXVtIGJvdW50eSBidWRnZXQgKE5vbmUgPSBubyBjaGFuZ2UpLgAAAAAAABF0YXJnZXRfbWluX2J1ZGdldAAAAAAAA+gAAAAL", "AAAAAQAAABhHb3Zlcm5hbmNlIENvbmZpZ3VyYXRpb24AAAAAAAAAEEdvdmVybmFuY2VDb25maWcAAAAGAAAAAAAAAA1hZG1pbl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAZZGlzcHV0ZV9yZXNvbHV0aW9uX3BlcmlvZAAAAAAAAAYAAAAAAAAADGxhc3RfdXBkYXRlZAAAAAYAAAAAAAAAEW1heF9ib3VudHlfYnVkZ2V0AAAAAAAACwAAAAAAAAARbWluX2JvdW50eV9idWRnZXQAAAAAAAALAAAAAAAAABRwbGF0Zm9ybV9mZWVfcGVyY2VudAAAAAQ=", "AAAAAQAAANRFeGVjdXRpb24gdGltZWxvY2sgZm9yIGFuIGFwcHJvdmVkIHByb3Bvc2FsLgoKQW4gYXBwcm92ZWQgcHJvcG9zYWwgbXVzdCB3YWl0IGB1bmxvY2tfYXRgIChsZWRnZXIgdGltZXN0YW1wKSBiZWZvcmUKYGV4ZWN1dGVfdGltZWxvY2tlZGAgY2FuIGJlIGNhbGxlZC4gIFRoaXMgZ3VhcmRzIGFnYWluc3QgZmxhc2gtbG9hbgpvciBydXNoZWQgZ292ZXJuYW5jZSBhdHRhY2tzLgAAAAAAAAARRXhlY3V0aW9uVGltZWxvY2sAAAAAAAACAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAAGAAAAAAAAAAl1bmxvY2tfYXQAAAAAAAAG", "AAAAAAAAAAAAAAAEdm90ZQAAAAMAAAAAAAAABXZvdGVyAAAAAAAAEwAAAAAAAAALcHJvcG9zYWxfaWQAAAAABgAAAAAAAAAIdm90ZV95ZXMAAAABAAAAAQAAAAE=", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAAEEdvdmVybmFuY2VDb25maWc=", "AAAAAAAAAAAAAAAMZ2V0X3Byb3Bvc2FsAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAABgAAAAEAAAfQAAAACFByb3Bvc2Fs", "AAAAAAAAADZSZXRyaWV2ZSB0aGUgZXhlY3V0aW9uIHRpbWVsb2NrIGZvciBhIHF1ZXVlZCBwcm9wb3NhbC4AAAAAAAxnZXRfdGltZWxvY2sAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAAGAAAAAQAAB9AAAAARRXhlY3V0aW9uVGltZWxvY2sAAAA=", "AAAAAAAAAPJDYXN0IGEgdG9rZW4td2VpZ2h0ZWQgdm90ZSBvbiBhIHByb3Bvc2FsLgoKYHRva2VuX3dlaWdodGAgaXMgdGhlIGNhbGxlcidzIHRva2VuIGJhbGFuY2UgdXNlZCBhcyB2b3RlIHdlaWdodC4gIFRoZQpjb250cmFjdCBhY2N1bXVsYXRlcyB3ZWlnaHRlZCB0YWxsaWVzIChgeWVzX3ZvdGVzYCAvIGBub192b3Rlc2ApIHNvIHRoYXQKbGFyZ2UgdG9rZW4gaG9sZGVycyBoYXZlIHByb3BvcnRpb25hbGx5IG1vcmUgaW5mbHVlbmNlLgAAAAAADXZvdGVfd2VpZ2h0ZWQAAAAAAAAEAAAAAAAAAAV2b3RlcgAAAAAAABMAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAYAAAAAAAAACHZvdGVfeWVzAAAAAQAAAAAAAAAMdG9rZW5fd2VpZ2h0AAAABgAAAAEAAAAB", "AAAAAAAAAEVSZXRyaWV2ZSB0aGUgd2VpZ2h0ZWQgdm90ZSByZWNvcmQgZm9yIGEgc3BlY2lmaWMgdm90ZXIgb24gYSBwcm9wb3NhbC4AAAAAAAAOZ2V0X3Rva2VuX3ZvdGUAAAAAAAIAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAYAAAAAAAAABXZvdGVyAAAAAAAAEwAAAAEAAAfQAAAACVRva2VuVm90ZQAAAA==", "AAAAAAAAAAAAAAAPY3JlYXRlX3Byb3Bvc2FsAAAAAAQAAAAAAAAACHByb3Bvc2VyAAAAEwAAAAAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAA12b3RpbmdfcGVyaW9kAAAAAAAABgAAAAEAAAAG", "AAAAAAAAALNRdWV1ZSBhbiBhcHByb3ZlZCBwcm9wb3NhbCBmb3IgdGltZWxvY2tlZCBleGVjdXRpb24uCgpgdGltZWxvY2tfZGVsYXlgIGlzIGluIHNlY29uZHMuICBUaGUgcHJvcG9zYWwgbXVzdCBhbHJlYWR5IGJlIGluCiJhcHByb3ZlZCIgc3RhdHVzIChpLmUuIGBleGVjdXRlX3Byb3Bvc2FsYCBoYXMgYmVlbiBjYWxsZWQpLgAAAAAPcXVldWVfZXhlY3V0aW9uAAAAAAIAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAYAAAAAAAAADnRpbWVsb2NrX2RlbGF5AAAAAAAGAAAAAA==", "AAAAAAAAAAAAAAAQZXhlY3V0ZV9wcm9wb3NhbAAAAAEAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAAAYAAAABAAAAAQ==", "AAAAAAAAAAAAAAAQc2V0X3BsYXRmb3JtX2ZlZQAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAALZmVlX3BlcmNlbnQAAAAABAAAAAEAAAAB", "AAAAAAAAAAAAAAARc2V0X2JvdW50eV9saW1pdHMAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACm1pbl9idWRnZXQAAAAAAAsAAAAAAAAACm1heF9idWRnZXQAAAAAAAsAAAABAAAAAQ==", "AAAAAAAAALZFeGVjdXRlIGEgdGltZWxvY2tlZCBwcm9wb3NhbCBhZnRlciBpdHMgZGVsYXkgaGFzIGVsYXBzZWQuCgpJZiB0aGUgcHJvcG9zYWwgY2FycmllcyBhIGBQcm9wb3NhbFBhcmFtYCAoc3RvcmVkIHZpYQpgY3JlYXRlX3BhcmFtX3Byb3Bvc2FsYCksIHRoZSBnb3Zlcm5hbmNlIGNvbmZpZyBpcyB1cGRhdGVkIG9uLWNoYWluLgAAAAAAEmV4ZWN1dGVfdGltZWxvY2tlZAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAABgAAAAEAAAAB", "AAAAAAAAAORDcmVhdGUgYSBwcm9wb3NhbCB0aGF0IGNhcnJpZXMgYW4gb24tY2hhaW4gcGFyYW1ldGVyIGNoYW5nZS4KCkNvbWJpbmVzIGBjcmVhdGVfcHJvcG9zYWxgIHdpdGggYXR0YWNoaW5nIGEgYFByb3Bvc2FsUGFyYW1gIHNvIHRoYXQKb24gYXBwcm92YWwgKyB0aW1lbG9jayBleHBpcnkgdGhlIGNvbmZpZyB1cGRhdGVzIGF0b21pY2FsbHkgd2l0aG91dCBhbnkKZnVydGhlciBhZG1pbiB0cmFuc2FjdGlvbi4AAAAVY3JlYXRlX3BhcmFtX3Byb3Bvc2FsAAAAAAAABQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAV0aXRsZQAAAAAAABAAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAGAAAAAAAAAAVwYXJhbQAAAAAAB9AAAAANUHJvcG9zYWxQYXJhbQAAAAAAAAEAAAAG"]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    vote : this.txFromJson<boolean>,  get_config : this.txFromJson<GovernanceConfig>,  get_proposal : this.txFromJson<Proposal>,  get_timelock : this.txFromJson<ExecutionTimelock>,  vote_weighted : this.txFromJson<boolean>,  get_token_vote : this.txFromJson<TokenVote>,  create_proposal : this.txFromJson<bigint>,  queue_execution : this.txFromJson<void>,  execute_proposal : this.txFromJson<boolean>,  set_platform_fee : this.txFromJson<boolean>,  set_bounty_limits : this.txFromJson<boolean>,  execute_timelocked : this.txFromJson<boolean>,  create_param_proposal : this.txFromJson<bigint>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

}