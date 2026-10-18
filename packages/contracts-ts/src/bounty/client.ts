import {Bounty, BountyApplication, BountyStatus} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address} from '@stellar/stellar-sdk';

export interface Client {
  get_bounty(args: { bounty_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Bounty>>;
  link_escrow(args: { bounty_id: bigint; escrow_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  cancel_bounty(args: { bounty_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  create_bounty(args: { creator: string | Address; title: string; description: string; budget: bigint; deadline: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  complete_bounty(args: { bounty_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  get_application(args: { application_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<BountyApplication>>;
  apply_for_bounty(args: { bounty_id: bigint; freelancer: string | Address; proposal: string; proposed_budget: bigint; timeline: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  get_applications(args: { bounty_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Array<BountyApplication>>>;
  select_freelancer(args: { bounty_id: bigint; application_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Called by the selected freelancer to signal work is done.
   * Transitions the bounty from InProgress → PendingCompletion. (#160)
   * The creator must then call complete_bounty to approve.
   */
  submit_completion(args: { bounty_id: bigint; freelancer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  get_bounties_count(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  set_escrow_contract(args: { admin: string | Address; escrow: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  create_and_fund_bounty(args: { creator: string | Address; title: string; description: string; budget: bigint; token: string | Address; deadline: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Optimized view: return all bounties matching a given status.
   * Avoids loading all bounties when only a subset is needed.
   */
  get_bounties_by_status(args: { status: BountyStatus }, options?: MethodOptions): Promise<AssembledTransaction<Array<Bounty>>>;
  /**
   * Optimized view: return a paginated slice of all bounties.
   * `offset` is zero-based; returns at most `limit` items.
   */
  get_bounties_paginated(args: { offset: bigint; limit: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Array<Bounty>>>;
  check_and_expire_bounty(args: { bounty_id: bigint; escrow_contract: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Estimate the total fee for creating a bounty with the given budget.
   * Returns: platform_fee + base_resource_fee
   *
   * Note: actual fee may vary by up to 10% from this estimate due to network conditions.
   * The estimate is guaranteed not to exceed actual fee by more than 10%.
   */
  estimate_create_bounty_fee(args: { budget: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAQAAAA1Cb3VudHkgU3RydWN0AAAAAAAAAAAAAAZCb3VudHkAAAAAAAsAAAAAAAAABmJ1ZGdldAAAAAAACwAAAAAAAAAMY29tcGxldGVkX2F0AAAD6AAAAAYAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAAllc2Nyb3dfaWQAAAAAAAAGAAAAAAAAAAJpZAAAAAAABgAAAAAAAAATc2VsZWN0ZWRfZnJlZWxhbmNlcgAAAAPoAAAAEwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADEJvdW50eVN0YXR1cwAAAAAAAAAFdGl0bGUAAAAAAAAQ", "AAAAAgAAACFEYXRhS2V5IGZvciB0eXBlZCBzdG9yYWdlIGxvb2t1cHMAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAQAAAAAAAAAAAAAADkVzY3Jvd0NvbnRyYWN0AAA=", "AAAABAAAABJCb3VudHkgRXJyb3IgQ29kZXMAAAAAAAAAAAALQm91bnR5RXJyb3IAAAAAAwAAAAAAAAARRGVhZGxpbmVOb3RQYXNzZWQAAAAAAAABAAAAAAAAABBBbHJlYWR5UHJvY2Vzc2VkAAAAAgAAAAAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAAAD", "AAAAAwAAABJCb3VudHkgU3RhdHVzIEVudW0AAAAAAAAAAAAMQm91bnR5U3RhdHVzAAAABgAAAAAAAAAET3BlbgAAAAAAAAAAAAAACkluUHJvZ3Jlc3MAAAAAAAEAAAAAAAAACUNvbXBsZXRlZAAAAAAAAAIAAAAAAAAACERpc3B1dGVkAAAAAwAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAABAAAAAAAAAARUGVuZGluZ0NvbXBsZXRpb24AAAAAAAAF", "AAAAAgAAAAAAAAAAAAAAEFJlbGVhc2VDb25kaXRpb24AAAACAAAAAAAAAAAAAAAMT25Db21wbGV0aW9uAAAAAQAAAAAAAAAIVGltZWxvY2sAAAABAAAABg==", "AAAAAQAAABlCb3VudHkgQXBwbGljYXRpb24gU3RydWN0AAAAAAAAAAAAABFCb3VudHlBcHBsaWNhdGlvbgAAAAAAAAgAAAAAAAAACWJvdW50eV9pZAAAAAAAAAYAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAACmZyZWVsYW5jZXIAAAAAABMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAhwcm9wb3NhbAAAABAAAAAAAAAAD3Byb3Bvc2VkX2J1ZGdldAAAAAALAAAAAAAAAAZzdGF0dXMAAAAAABAAAAAAAAAACHRpbWVsaW5lAAAABg==", "AAAAAAAAAAAAAAAKZ2V0X2JvdW50eQAAAAAAAQAAAAAAAAAJYm91bnR5X2lkAAAAAAAABgAAAAEAAAfQAAAABkJvdW50eQAA", "AAAAAAAAAAAAAAALbGlua19lc2Nyb3cAAAAAAgAAAAAAAAAJYm91bnR5X2lkAAAAAAAABgAAAAAAAAAJZXNjcm93X2lkAAAAAAAABgAAAAEAAAAB", "AAAAAAAAAAAAAAANY2FuY2VsX2JvdW50eQAAAAAAAAEAAAAAAAAACWJvdW50eV9pZAAAAAAAAAYAAAABAAAAAQ==", "AAAAAAAAAAAAAAANY3JlYXRlX2JvdW50eQAAAAAAAAUAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAAZidWRnZXQAAAAAAAsAAAAAAAAACGRlYWRsaW5lAAAABgAAAAEAAAAG", "AAAAAAAAAAAAAAAPY29tcGxldGVfYm91bnR5AAAAAAEAAAAAAAAACWJvdW50eV9pZAAAAAAAAAYAAAABAAAAAQ==", "AAAAAAAAAAAAAAAPZ2V0X2FwcGxpY2F0aW9uAAAAAAEAAAAAAAAADmFwcGxpY2F0aW9uX2lkAAAAAAAGAAAAAQAAB9AAAAARQm91bnR5QXBwbGljYXRpb24AAAA=", "AAAAAAAAAAAAAAAQYXBwbHlfZm9yX2JvdW50eQAAAAUAAAAAAAAACWJvdW50eV9pZAAAAAAAAAYAAAAAAAAACmZyZWVsYW5jZXIAAAAAABMAAAAAAAAACHByb3Bvc2FsAAAAEAAAAAAAAAAPcHJvcG9zZWRfYnVkZ2V0AAAAAAsAAAAAAAAACHRpbWVsaW5lAAAABgAAAAEAAAAG", "AAAAAAAAAAAAAAAQZ2V0X2FwcGxpY2F0aW9ucwAAAAEAAAAAAAAACWJvdW50eV9pZAAAAAAAAAYAAAABAAAD6gAAB9AAAAARQm91bnR5QXBwbGljYXRpb24AAAA=", "AAAAAAAAAAAAAAARc2VsZWN0X2ZyZWVsYW5jZXIAAAAAAAACAAAAAAAAAAlib3VudHlfaWQAAAAAAAAGAAAAAAAAAA5hcHBsaWNhdGlvbl9pZAAAAAAABgAAAAEAAAAB", "AAAAAAAAALVDYWxsZWQgYnkgdGhlIHNlbGVjdGVkIGZyZWVsYW5jZXIgdG8gc2lnbmFsIHdvcmsgaXMgZG9uZS4KVHJhbnNpdGlvbnMgdGhlIGJvdW50eSBmcm9tIEluUHJvZ3Jlc3Mg4oaSIFBlbmRpbmdDb21wbGV0aW9uLiAoIzE2MCkKVGhlIGNyZWF0b3IgbXVzdCB0aGVuIGNhbGwgY29tcGxldGVfYm91bnR5IHRvIGFwcHJvdmUuAAAAAAAAEXN1Ym1pdF9jb21wbGV0aW9uAAAAAAAAAgAAAAAAAAAJYm91bnR5X2lkAAAAAAAABgAAAAAAAAAKZnJlZWxhbmNlcgAAAAAAEwAAAAEAAAAB", "AAAAAAAAAAAAAAASZ2V0X2JvdW50aWVzX2NvdW50AAAAAAAAAAAAAQAAAAY=", "AAAAAAAAAAAAAAATc2V0X2VzY3Jvd19jb250cmFjdAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAEAAAAB", "AAAAAAAAAAAAAAAWY3JlYXRlX2FuZF9mdW5kX2JvdW50eQAAAAAABgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAV0aXRsZQAAAAAAABAAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAABmJ1ZGdldAAAAAAACwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAhkZWFkbGluZQAAAAYAAAABAAAABg==", "AAAAAAAAAHZPcHRpbWl6ZWQgdmlldzogcmV0dXJuIGFsbCBib3VudGllcyBtYXRjaGluZyBhIGdpdmVuIHN0YXR1cy4KQXZvaWRzIGxvYWRpbmcgYWxsIGJvdW50aWVzIHdoZW4gb25seSBhIHN1YnNldCBpcyBuZWVkZWQuAAAAAAAWZ2V0X2JvdW50aWVzX2J5X3N0YXR1cwAAAAAAAQAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADEJvdW50eVN0YXR1cwAAAAEAAAPqAAAH0AAAAAZCb3VudHkAAA==", "AAAAAAAAAHBPcHRpbWl6ZWQgdmlldzogcmV0dXJuIGEgcGFnaW5hdGVkIHNsaWNlIG9mIGFsbCBib3VudGllcy4KYG9mZnNldGAgaXMgemVyby1iYXNlZDsgcmV0dXJucyBhdCBtb3N0IGBsaW1pdGAgaXRlbXMuAAAAFmdldF9ib3VudGllc19wYWdpbmF0ZWQAAAAAAAIAAAAAAAAABm9mZnNldAAAAAAABgAAAAAAAAAFbGltaXQAAAAAAAAGAAAAAQAAA+oAAAfQAAAABkJvdW50eQAA", "AAAAAAAAAAAAAAAXY2hlY2tfYW5kX2V4cGlyZV9ib3VudHkAAAAAAgAAAAAAAAAJYm91bnR5X2lkAAAAAAAABgAAAAAAAAAPZXNjcm93X2NvbnRyYWN0AAAAABMAAAABAAAAAQ==", "AAAAAAAAAQlFc3RpbWF0ZSB0aGUgdG90YWwgZmVlIGZvciBjcmVhdGluZyBhIGJvdW50eSB3aXRoIHRoZSBnaXZlbiBidWRnZXQuClJldHVybnM6IHBsYXRmb3JtX2ZlZSArIGJhc2VfcmVzb3VyY2VfZmVlCgpOb3RlOiBhY3R1YWwgZmVlIG1heSB2YXJ5IGJ5IHVwIHRvIDEwJSBmcm9tIHRoaXMgZXN0aW1hdGUgZHVlIHRvIG5ldHdvcmsgY29uZGl0aW9ucy4KVGhlIGVzdGltYXRlIGlzIGd1YXJhbnRlZWQgbm90IHRvIGV4Y2VlZCBhY3R1YWwgZmVlIGJ5IG1vcmUgdGhhbiAxMCUuAAAAAAAAGmVzdGltYXRlX2NyZWF0ZV9ib3VudHlfZmVlAAAAAAABAAAAAAAAAAZidWRnZXQAAAAAAAsAAAABAAAACw=="]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    get_bounty : this.txFromJson<Bounty>,  link_escrow : this.txFromJson<boolean>,  cancel_bounty : this.txFromJson<boolean>,  create_bounty : this.txFromJson<bigint>,  complete_bounty : this.txFromJson<boolean>,  get_application : this.txFromJson<BountyApplication>,  apply_for_bounty : this.txFromJson<bigint>,  get_applications : this.txFromJson<Array<BountyApplication>>,  select_freelancer : this.txFromJson<boolean>,  submit_completion : this.txFromJson<boolean>,  get_bounties_count : this.txFromJson<bigint>,  set_escrow_contract : this.txFromJson<boolean>,  create_and_fund_bounty : this.txFromJson<bigint>,  get_bounties_by_status : this.txFromJson<Array<Bounty>>,  get_bounties_paginated : this.txFromJson<Array<Bounty>>,  check_and_expire_bounty : this.txFromJson<boolean>,  estimate_create_bounty_fee : this.txFromJson<bigint>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

}