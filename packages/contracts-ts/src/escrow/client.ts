import {ReleaseCondition, EscrowAccount, Milestone} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Deposit funds into escrow
   */
  deposit(args: { bounty_id: bigint; payer: string | Address; payee: string | Address; amount: bigint; token: string | Address; release_condition: ReleaseCondition }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Get the current platform admin address.
   */
  get_admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Set the platform admin address. Can only be called once (bootstrap).
   */
  set_admin(args: { admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_escrow(args: { escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<EscrowAccount>>;
  can_release(args: { escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Accrue yield for an active escrow strictly within the contract.
   *
   * Yield is calculated as a pro-rata share of the annual rate scaled to the
   * elapsed seconds since `last_updated`.  The accrual is capped at
   * `max_yield_ratio` of the principal to prevent unbounded growth.
   *
   * No tokens move during accrual — the number is a credit held internally.
   */
  accrue_yield(args: { escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Add a milestone to an active escrow. Sum of milestone amounts must not exceed escrow amount.
   */
  add_milestone(args: { authorizer: string | Address; escrow_id: bigint; index: number; description: string; amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Return the platform fee that would be charged for a given gross amount.
   * Mirrors the `platform_fee` free function for on-chain queries.
   */
  calculate_fee(args: { gross_amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  get_milestone(args: { escrow_id: bigint; index: number }, options?: MethodOptions): Promise<AssembledTransaction<Milestone>>;
  /**
   * Refund escrow to payer. Only payer may call.
   */
  refund_escrow(args: { authorizer: string | Address; escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Release funds to payee. Authorizer must be payer or payee.
   */
  release_funds(args: { authorizer: string | Address; escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Mark escrow as disputed. Either party may raise a dispute.
   */
  dispute_escrow(args: { authorizer: string | Address; escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Withdraw accrued yield to the platform admin.
   *
   * Slashing protection: the withdrawal is rejected if it would leave the
   * contract holding less than `min_liquidity_bps` of the escrow principal,
   * ensuring payers can always retrieve their funds.
   */
  withdraw_yield(args: { admin: string | Address; escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Set yield configuration.  Only the platform admin may call this.
   */
  configure_yield(args: { admin: string | Address; rate_bps: number; max_yield_ratio: number; min_liquidity_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Resolve a disputed escrow. Only the platform admin may call this.
   *
   * `resolution`: `true` â†’ release funds to payee; `false` â†’ refund to payer.
   */
  resolve_dispute(args: { admin: string | Address; escrow_id: bigint; release_to_payee: boolean }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Read the currently accrued yield for an escrow without modifying state.
   */
  get_accrued_yield(args: { escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Release a single milestone payment to payee. Authorizer must be payer.
   */
  release_milestone(args: { authorizer: string | Address; escrow_id: bigint; index: number }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Submit a Stellar transaction for an escrow operation.
   *
   * This is the on-chain entry point called by the backend Stellar SDK
   * after building and signing a transaction envelope. It validates the
   * operation type and delegates to the appropriate escrow function.
   *
   * `operation`: one of "deposit", "release", "refund", "dispute"
   * `escrow_id`: target escrow (0 for deposit, which creates a new one)
   * Returns the escrow_id that was acted upon.
   */
  submit_transaction(args: { caller: string | Address; operation: string; escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Refund an expired bounty's escrow to the payer. Called by the bounty contract when expiring.
   */
  refund_expired_bounty(args: { bounty_id: bigint; bounty_contract: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Returns milestone progress for an escrow: (released_count, milestone_count, released_amount, total_amount).
   */
  get_milestone_progress(args: { escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<[number, number, bigint, bigint]>>;
  /**
   * Estimate the total fee for funding an escrow with the given amount.
   * Returns the platform_fee for the specified amount.
   *
   * Note: actual fee may vary by up to 10% from this estimate due to network conditions.
   * The estimate is guaranteed not to exceed actual fee by more than 10%.
   */
  estimate_fund_escrow_fee(args: { amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  get_active_escrows_count(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Get the latest escrow ID for a specific bounty.
   */
  get_escrow_id_for_bounty(args: { bounty_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAgAAAC1EYXRhS2V5IGZvciB0eXBlZCBwZXJzaXN0ZW50IHN0b3JhZ2UgbG9va3Vwcy4AAAAAAAAAAAAAB0RhdGFLZXkAAAAACAAAAAEAAAAAAAAABkVzY3JvdwAAAAAAAQAAAAYAAAAAAAAAAAAAAA1Fc2Nyb3dDb3VudGVyAAAAAAAAAQAAAAAAAAAFWWllbGQAAAAAAAABAAAABgAAAAAAAAAAAAAACFlpZWxkQ2ZnAAAAAQAAAAAAAAAOTWlsZXN0b25lQ291bnQAAAAAAAEAAAAGAAAAAQAAAAAAAAAOTWlsZXN0b25lVG90YWwAAAAAAAEAAAAGAAAAAQAAAAAAAAAWTWlsZXN0b25lUmVsZWFzZWRDb3VudAAAAAAAAQAAAAYAAAABAAAAAAAAABdNaWxlc3RvbmVSZWxlYXNlZEFtb3VudAAAAAABAAAABg==", "AAAAAQAAAD1NaWxlc3RvbmUgw6LigqzigJ0gYSBuYW1lZCBwb3J0aW9uIG9mIHRoZSB0b3RhbCBlc2Nyb3cgYW1vdW50AAAAAAAAAAAAAAlNaWxlc3RvbmUAAAAAAAAFAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABEAAAAAAAAACWVzY3Jvd19pZAAAAAAAAAYAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAIcmVsZWFzZWQAAAAB", "AAAAAQAAAYZQbGF0Zm9ybS1sZXZlbCB5aWVsZCBjb25maWd1cmF0aW9uIHNldCBieSB0aGUgYWRtaW4uCgpgcmF0ZV9icHNgICAgICAgICAgICDigJQgYW5udWFsIHlpZWxkIHJhdGUgaW4gYmFzaXMgcG9pbnRzIChlLmcuIDMwMCA9IDMgJSkKYG1heF95aWVsZF9yYXRpb2AgICAg4oCUIG1heGltdW0geWllbGQgYXMgYSBmcmFjdGlvbiBvZiBwcmluY2lwYWwgaW4gYnBzCihlLmcuIDUwMCA9IDUgJSBjYXA7IHByb3RlY3RzIGFnYWluc3QgcnVuYXdheSBhY2NydWFsKQpgbWluX2xpcXVpZGl0eV9icHNgICDigJQgbWluaW11bSBwcmluY2lwYWwgdGhhdCBtdXN0IHJlbWFpbiBsaXF1aWQsIGluIGJwcyBvZgp0b3RhbCBsb2NrZWQgKGUuZy4gOTAwMCA9IDkwICUgbXVzdCBzdGF5IHdpdGhkcmF3YWJsZSkAAAAAAAAAAAALWWllbGRDb25maWcAAAAAAwAAAAAAAAAPbWF4X3lpZWxkX3JhdGlvAAAAAAQAAAAAAAAAEW1pbl9saXF1aWRpdHlfYnBzAAAAAAAABAAAAAAAAAAIcmF0ZV9icHMAAAAE", "AAAAAwAAAA1Fc2Nyb3cgU3RhdHVzAAAAAAAAAAAAAAxFc2Nyb3dTdGF0dXMAAAAFAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAACFJlbGVhc2VkAAAAAQAAAAAAAAAIUmVmdW5kZWQAAAACAAAAAAAAAAhEaXNwdXRlZAAAAAMAAAAAAAAACENvbXBsZXRlAAAABA==", "AAAAAQAAAINQZXItZXNjcm93IHlpZWxkIGFjY3J1YWwgdHJhY2tpbmcuICBZaWVsZCBpcyBoZWxkIGludGVybmFsbHkgaW4gdGhlCmNvbnRyYWN0IGFuZCBuZXZlciBjcmVkaXRlZCB0byBlaXRoZXIgcGFydHkncyBvZmYtY2hhaW4gbGVkZ2VyLgAAAAAAAAAADFlpZWxkQWNjcnVhbAAAAAQAAAAAAAAAB2FjY3J1ZWQAAAAACwAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAAAAAAMbGFzdF91cGRhdGVkAAAABgAAAAAAAAAJcHJpbmNpcGFsAAAAAAAACw==", "AAAAAQAAAA5Fc2Nyb3cgQWNjb3VudAAAAAAAAAAAAA1Fc2Nyb3dBY2NvdW50AAAAAAAACwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlib3VudHlfaWQAAAAAAAAGAAAAAAAAAApjcmVhdGVkX2F0AAAAAAAGAAAAAAAAAA1mZWVfY29sbGVjdGVkAAAAAAAACwAAAAAAAAACaWQAAAAAAAYAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAABFyZWxlYXNlX2NvbmRpdGlvbgAAAAAAB9AAAAAQUmVsZWFzZUNvbmRpdGlvbgAAAAAAAAALcmVsZWFzZWRfYXQAAAAD6AAAAAYAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAxFc2Nyb3dTdGF0dXMAAAAAAAAABXRva2VuAAAAAAAAEw==", "AAAAAgAAABFSZWxlYXNlIENvbmRpdGlvbgAAAAAAAAAAAAAQUmVsZWFzZUNvbmRpdGlvbgAAAAIAAAAAAAAAAAAAAAxPbkNvbXBsZXRpb24AAAABAAAAAAAAAAhUaW1lbG9jawAAAAEAAAAG", "AAAAAAAAABlEZXBvc2l0IGZ1bmRzIGludG8gZXNjcm93AAAAAAAAB2RlcG9zaXQAAAAABgAAAAAAAAAJYm91bnR5X2lkAAAAAAAABgAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAVwYXllZQAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAABFyZWxlYXNlX2NvbmRpdGlvbgAAAAAAB9AAAAAQUmVsZWFzZUNvbmRpdGlvbgAAAAEAAAAG", "AAAAAAAAACdHZXQgdGhlIGN1cnJlbnQgcGxhdGZvcm0gYWRtaW4gYWRkcmVzcy4AAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAERTZXQgdGhlIHBsYXRmb3JtIGFkbWluIGFkZHJlc3MuIENhbiBvbmx5IGJlIGNhbGxlZCBvbmNlIChib290c3RyYXApLgAAAAlzZXRfYWRtaW4AAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAA", "AAAAAAAAAAAAAAAKZ2V0X2VzY3JvdwAAAAAAAQAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAEAAAfQAAAADUVzY3Jvd0FjY291bnQAAAA=", "AAAAAAAAAAAAAAALY2FuX3JlbGVhc2UAAAAAAQAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAEAAAAB", "AAAAAAAAAVRBY2NydWUgeWllbGQgZm9yIGFuIGFjdGl2ZSBlc2Nyb3cgc3RyaWN0bHkgd2l0aGluIHRoZSBjb250cmFjdC4KCllpZWxkIGlzIGNhbGN1bGF0ZWQgYXMgYSBwcm8tcmF0YSBzaGFyZSBvZiB0aGUgYW5udWFsIHJhdGUgc2NhbGVkIHRvIHRoZQplbGFwc2VkIHNlY29uZHMgc2luY2UgYGxhc3RfdXBkYXRlZGAuICBUaGUgYWNjcnVhbCBpcyBjYXBwZWQgYXQKYG1heF95aWVsZF9yYXRpb2Agb2YgdGhlIHByaW5jaXBhbCB0byBwcmV2ZW50IHVuYm91bmRlZCBncm93dGguCgpObyB0b2tlbnMgbW92ZSBkdXJpbmcgYWNjcnVhbCDigJQgdGhlIG51bWJlciBpcyBhIGNyZWRpdCBoZWxkIGludGVybmFsbHkuAAAADGFjY3J1ZV95aWVsZAAAAAEAAAAAAAAACWVzY3Jvd19pZAAAAAAAAAYAAAAA", "AAAAAAAAAFxBZGQgYSBtaWxlc3RvbmUgdG8gYW4gYWN0aXZlIGVzY3Jvdy4gU3VtIG9mIG1pbGVzdG9uZSBhbW91bnRzIG11c3Qgbm90IGV4Y2VlZCBlc2Nyb3cgYW1vdW50LgAAAA1hZGRfbWlsZXN0b25lAAAAAAAABQAAAAAAAAAKYXV0aG9yaXplcgAAAAAAEwAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAARAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA", "AAAAAAAAAIZSZXR1cm4gdGhlIHBsYXRmb3JtIGZlZSB0aGF0IHdvdWxkIGJlIGNoYXJnZWQgZm9yIGEgZ2l2ZW4gZ3Jvc3MgYW1vdW50LgpNaXJyb3JzIHRoZSBgcGxhdGZvcm1fZmVlYCBmcmVlIGZ1bmN0aW9uIGZvciBvbi1jaGFpbiBxdWVyaWVzLgAAAAAADWNhbGN1bGF0ZV9mZWUAAAAAAAABAAAAAAAAAAxncm9zc19hbW91bnQAAAALAAAAAQAAAAs=", "AAAAAAAAAAAAAAANZ2V0X21pbGVzdG9uZQAAAAAAAAIAAAAAAAAACWVzY3Jvd19pZAAAAAAAAAYAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAfQAAAACU1pbGVzdG9uZQAAAA==", "AAAAAAAAACxSZWZ1bmQgZXNjcm93IHRvIHBheWVyLiBPbmx5IHBheWVyIG1heSBjYWxsLgAAAA1yZWZ1bmRfZXNjcm93AAAAAAAAAgAAAAAAAAAKYXV0aG9yaXplcgAAAAAAEwAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAEAAAAB", "AAAAAAAAADpSZWxlYXNlIGZ1bmRzIHRvIHBheWVlLiBBdXRob3JpemVyIG11c3QgYmUgcGF5ZXIgb3IgcGF5ZWUuAAAAAAANcmVsZWFzZV9mdW5kcwAAAAAAAAIAAAAAAAAACmF1dGhvcml6ZXIAAAAAABMAAAAAAAAACWVzY3Jvd19pZAAAAAAAAAYAAAABAAAAAQ==", "AAAAAAAAADpNYXJrIGVzY3JvdyBhcyBkaXNwdXRlZC4gRWl0aGVyIHBhcnR5IG1heSByYWlzZSBhIGRpc3B1dGUuAAAAAAAOZGlzcHV0ZV9lc2Nyb3cAAAAAAAIAAAAAAAAACmF1dGhvcml6ZXIAAAAAABMAAAAAAAAACWVzY3Jvd19pZAAAAAAAAAYAAAABAAAAAQ==", "AAAAAAAAAO1XaXRoZHJhdyBhY2NydWVkIHlpZWxkIHRvIHRoZSBwbGF0Zm9ybSBhZG1pbi4KClNsYXNoaW5nIHByb3RlY3Rpb246IHRoZSB3aXRoZHJhd2FsIGlzIHJlamVjdGVkIGlmIGl0IHdvdWxkIGxlYXZlIHRoZQpjb250cmFjdCBob2xkaW5nIGxlc3MgdGhhbiBgbWluX2xpcXVpZGl0eV9icHNgIG9mIHRoZSBlc2Nyb3cgcHJpbmNpcGFsLAplbnN1cmluZyBwYXllcnMgY2FuIGFsd2F5cyByZXRyaWV2ZSB0aGVpciBmdW5kcy4AAAAAAAAOd2l0aGRyYXdfeWllbGQAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAEAAAAL", "AAAAAAAAAEBTZXQgeWllbGQgY29uZmlndXJhdGlvbi4gIE9ubHkgdGhlIHBsYXRmb3JtIGFkbWluIG1heSBjYWxsIHRoaXMuAAAAD2NvbmZpZ3VyZV95aWVsZAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHJhdGVfYnBzAAAABAAAAAAAAAAPbWF4X3lpZWxkX3JhdGlvAAAAAAQAAAAAAAAAEW1pbl9saXF1aWRpdHlfYnBzAAAAAAAABAAAAAA=", "AAAAAAAAAJpSZXNvbHZlIGEgZGlzcHV0ZWQgZXNjcm93LiBPbmx5IHRoZSBwbGF0Zm9ybSBhZG1pbiBtYXkgY2FsbCB0aGlzLgoKYHJlc29sdXRpb25gOiBgdHJ1ZWAgw6LigKDigJkgcmVsZWFzZSBmdW5kcyB0byBwYXllZTsgYGZhbHNlYCDDouKAoOKAmSByZWZ1bmQgdG8gcGF5ZXIuAAAAAAAPcmVzb2x2ZV9kaXNwdXRlAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAAAAAAQcmVsZWFzZV90b19wYXllZQAAAAEAAAABAAAAAQ==", "AAAAAAAAAEdSZWFkIHRoZSBjdXJyZW50bHkgYWNjcnVlZCB5aWVsZCBmb3IgYW4gZXNjcm93IHdpdGhvdXQgbW9kaWZ5aW5nIHN0YXRlLgAAAAARZ2V0X2FjY3J1ZWRfeWllbGQAAAAAAAABAAAAAAAAAAllc2Nyb3dfaWQAAAAAAAAGAAAAAQAAAAs=", "AAAAAAAAAEZSZWxlYXNlIGEgc2luZ2xlIG1pbGVzdG9uZSBwYXltZW50IHRvIHBheWVlLiBBdXRob3JpemVyIG11c3QgYmUgcGF5ZXIuAAAAAAARcmVsZWFzZV9taWxlc3RvbmUAAAAAAAADAAAAAAAAAAphdXRob3JpemVyAAAAAAATAAAAAAAAAAllc2Nyb3dfaWQAAAAAAAAGAAAAAAAAAAVpbmRleAAAAAAAAAQAAAABAAAAAQ==", "AAAAAAAAAaxTdWJtaXQgYSBTdGVsbGFyIHRyYW5zYWN0aW9uIGZvciBhbiBlc2Nyb3cgb3BlcmF0aW9uLgoKVGhpcyBpcyB0aGUgb24tY2hhaW4gZW50cnkgcG9pbnQgY2FsbGVkIGJ5IHRoZSBiYWNrZW5kIFN0ZWxsYXIgU0RLCmFmdGVyIGJ1aWxkaW5nIGFuZCBzaWduaW5nIGEgdHJhbnNhY3Rpb24gZW52ZWxvcGUuIEl0IHZhbGlkYXRlcyB0aGUKb3BlcmF0aW9uIHR5cGUgYW5kIGRlbGVnYXRlcyB0byB0aGUgYXBwcm9wcmlhdGUgZXNjcm93IGZ1bmN0aW9uLgoKYG9wZXJhdGlvbmA6IG9uZSBvZiAiZGVwb3NpdCIsICJyZWxlYXNlIiwgInJlZnVuZCIsICJkaXNwdXRlIgpgZXNjcm93X2lkYDogdGFyZ2V0IGVzY3JvdyAoMCBmb3IgZGVwb3NpdCwgd2hpY2ggY3JlYXRlcyBhIG5ldyBvbmUpClJldHVybnMgdGhlIGVzY3Jvd19pZCB0aGF0IHdhcyBhY3RlZCB1cG9uLgAAABJzdWJtaXRfdHJhbnNhY3Rpb24AAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAJb3BlcmF0aW9uAAAAAAAAEQAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAEAAAAG", "AAAAAAAAAFxSZWZ1bmQgYW4gZXhwaXJlZCBib3VudHkncyBlc2Nyb3cgdG8gdGhlIHBheWVyLiBDYWxsZWQgYnkgdGhlIGJvdW50eSBjb250cmFjdCB3aGVuIGV4cGlyaW5nLgAAABVyZWZ1bmRfZXhwaXJlZF9ib3VudHkAAAAAAAACAAAAAAAAAAlib3VudHlfaWQAAAAAAAAGAAAAAAAAAA9ib3VudHlfY29udHJhY3QAAAAAEwAAAAEAAAAB", "AAAAAAAAAGtSZXR1cm5zIG1pbGVzdG9uZSBwcm9ncmVzcyBmb3IgYW4gZXNjcm93OiAocmVsZWFzZWRfY291bnQsIG1pbGVzdG9uZV9jb3VudCwgcmVsZWFzZWRfYW1vdW50LCB0b3RhbF9hbW91bnQpLgAAAAAWZ2V0X21pbGVzdG9uZV9wcm9ncmVzcwAAAAAAAQAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAEAAAPtAAAABAAAAAQAAAAEAAAACwAAAAs=", "AAAAAAAAARJFc3RpbWF0ZSB0aGUgdG90YWwgZmVlIGZvciBmdW5kaW5nIGFuIGVzY3JvdyB3aXRoIHRoZSBnaXZlbiBhbW91bnQuClJldHVybnMgdGhlIHBsYXRmb3JtX2ZlZSBmb3IgdGhlIHNwZWNpZmllZCBhbW91bnQuCgpOb3RlOiBhY3R1YWwgZmVlIG1heSB2YXJ5IGJ5IHVwIHRvIDEwJSBmcm9tIHRoaXMgZXN0aW1hdGUgZHVlIHRvIG5ldHdvcmsgY29uZGl0aW9ucy4KVGhlIGVzdGltYXRlIGlzIGd1YXJhbnRlZWQgbm90IHRvIGV4Y2VlZCBhY3R1YWwgZmVlIGJ5IG1vcmUgdGhhbiAxMCUuAAAAAAAYZXN0aW1hdGVfZnVuZF9lc2Nyb3dfZmVlAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAAAs=", "AAAAAAAAAAAAAAAYZ2V0X2FjdGl2ZV9lc2Nyb3dzX2NvdW50AAAAAAAAAAEAAAAG", "AAAAAAAAAC9HZXQgdGhlIGxhdGVzdCBlc2Nyb3cgSUQgZm9yIGEgc3BlY2lmaWMgYm91bnR5LgAAAAAYZ2V0X2VzY3Jvd19pZF9mb3JfYm91bnR5AAAAAQAAAAAAAAAJYm91bnR5X2lkAAAAAAAABgAAAAEAAAAG"]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    deposit : this.txFromJson<bigint>,  get_admin : this.txFromJson<string>,  set_admin : this.txFromJson<void>,  get_escrow : this.txFromJson<EscrowAccount>,  can_release : this.txFromJson<boolean>,  accrue_yield : this.txFromJson<void>,  add_milestone : this.txFromJson<void>,  calculate_fee : this.txFromJson<bigint>,  get_milestone : this.txFromJson<Milestone>,  refund_escrow : this.txFromJson<boolean>,  release_funds : this.txFromJson<boolean>,  dispute_escrow : this.txFromJson<boolean>,  withdraw_yield : this.txFromJson<bigint>,  configure_yield : this.txFromJson<void>,  resolve_dispute : this.txFromJson<boolean>,  get_accrued_yield : this.txFromJson<bigint>,  release_milestone : this.txFromJson<boolean>,  submit_transaction : this.txFromJson<bigint>,  refund_expired_bounty : this.txFromJson<boolean>,  get_milestone_progress : this.txFromJson<[number, number, bigint, bigint]>,  estimate_fund_escrow_fee : this.txFromJson<bigint>,  get_active_escrows_count : this.txFromJson<bigint>,  get_escrow_id_for_bounty : this.txFromJson<bigint>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

}