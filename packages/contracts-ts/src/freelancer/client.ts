import {FreelancerProfile, IdentityMetadata} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Set the contract owner. Must be called once after deployment.
   */
  initialize(args: { owner: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_profile(args: { freelancer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<FreelancerProfile>>;
  is_verified(args: { freelancer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Update the rating for a freelancer. Only the contract owner may call this
   * to prevent self-rating abuse. (#312)
   *
   * `new_rating` must be in [0, 500] (0–5 stars × 100). (#183)
   */
  update_rating(args: { freelancer: string | Address; new_rating: number }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Update earnings for a freelancer. Only the contract owner may call this. (#312)
   */
  update_earnings(args: { freelancer: string | Address; amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Verify a freelancer. Only the contract owner may call this. (#312)
   */
  verify_freelancer(args: { freelancer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  register_freelancer(args: { freelancer: string | Address; name: string; discipline: string; bio: string }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  get_freelancers_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Retrieve identity metadata for a given address.
   */
  get_identity_metadata(args: { user: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<IdentityMetadata>>;
  /**
   * Set identity metadata for the authenticated user.
   */
  set_identity_metadata(args: { user: string | Address; metadata: Map<string, string> }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Retrieve the user address associated with a public key.
   */
  get_user_by_public_key(args: { public_key: string }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Map a Stellar public key to a user address. Only the contract owner may call this.
   */
  set_public_key_mapping(args: { public_key: string; user: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Record a completed project. Only the contract owner may call this. (#312)
   */
  update_completed_projects(args: { freelancer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAQAAABpJZGVudGl0eSBSZWdpc3RyeSBNZXRhZGF0YQAAAAAAAAAAABBJZGVudGl0eU1ldGFkYXRhAAAAAwAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAxsYXN0X3VwZGF0ZWQAAAAGAAAAAAAAAAhtZXRhZGF0YQAAA+wAAAAQAAAAEA==", "AAAAAQAAABJGcmVlbGFuY2VyIFByb2ZpbGUAAAAAAAAAAAARRnJlZWxhbmNlclByb2ZpbGUAAAAAAAAKAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAA2JpbwAAAAAQAAAAAAAAABJjb21wbGV0ZWRfcHJvamVjdHMAAAAAAAQAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAACmRpc2NpcGxpbmUAAAAAABAAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAZyYXRpbmcAAAAAAAQAAAAAAAAADnRvdGFsX2Vhcm5pbmdzAAAAAAALAAAAAAAAABJ0b3RhbF9yYXRpbmdfY291bnQAAAAAAAQAAAAAAAAACHZlcmlmaWVkAAAAAQ==", "AAAAAAAAAD1TZXQgdGhlIGNvbnRyYWN0IG93bmVyLiBNdXN0IGJlIGNhbGxlZCBvbmNlIGFmdGVyIGRlcGxveW1lbnQuAAAAAAAACmluaXRpYWxpemUAAAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAALZ2V0X3Byb2ZpbGUAAAAAAQAAAAAAAAAKZnJlZWxhbmNlcgAAAAAAEwAAAAEAAAfQAAAAEUZyZWVsYW5jZXJQcm9maWxlAAAA", "AAAAAAAAAAAAAAALaXNfdmVyaWZpZWQAAAAAAQAAAAAAAAAKZnJlZWxhbmNlcgAAAAAAEwAAAAEAAAAB", "AAAAAAAAAK1VcGRhdGUgdGhlIHJhdGluZyBmb3IgYSBmcmVlbGFuY2VyLiBPbmx5IHRoZSBjb250cmFjdCBvd25lciBtYXkgY2FsbCB0aGlzCnRvIHByZXZlbnQgc2VsZi1yYXRpbmcgYWJ1c2UuICgjMzEyKQoKYG5ld19yYXRpbmdgIG11c3QgYmUgaW4gWzAsIDUwMF0gKDDigJM1IHN0YXJzIMOXIDEwMCkuICgjMTgzKQAAAAAAAA11cGRhdGVfcmF0aW5nAAAAAAAAAgAAAAAAAAAKZnJlZWxhbmNlcgAAAAAAEwAAAAAAAAAKbmV3X3JhdGluZwAAAAAABAAAAAEAAAAB", "AAAAAAAAAE9VcGRhdGUgZWFybmluZ3MgZm9yIGEgZnJlZWxhbmNlci4gT25seSB0aGUgY29udHJhY3Qgb3duZXIgbWF5IGNhbGwgdGhpcy4gKCMzMTIpAAAAAA91cGRhdGVfZWFybmluZ3MAAAAAAgAAAAAAAAAKZnJlZWxhbmNlcgAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAAAE=", "AAAAAAAAAEJWZXJpZnkgYSBmcmVlbGFuY2VyLiBPbmx5IHRoZSBjb250cmFjdCBvd25lciBtYXkgY2FsbCB0aGlzLiAoIzMxMikAAAAAABF2ZXJpZnlfZnJlZWxhbmNlcgAAAAAAAAEAAAAAAAAACmZyZWVsYW5jZXIAAAAAABMAAAABAAAAAQ==", "AAAAAAAAAAAAAAATcmVnaXN0ZXJfZnJlZWxhbmNlcgAAAAAEAAAAAAAAAApmcmVlbGFuY2VyAAAAAAATAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAKZGlzY2lwbGluZQAAAAAAEAAAAAAAAAADYmlvAAAAABAAAAABAAAAAQ==", "AAAAAAAAAAAAAAAVZ2V0X2ZyZWVsYW5jZXJzX2NvdW50AAAAAAAAAAAAAAEAAAAE", "AAAAAAAAAC9SZXRyaWV2ZSBpZGVudGl0eSBtZXRhZGF0YSBmb3IgYSBnaXZlbiBhZGRyZXNzLgAAAAAVZ2V0X2lkZW50aXR5X21ldGFkYXRhAAAAAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAH0AAAABBJZGVudGl0eU1ldGFkYXRh", "AAAAAAAAADFTZXQgaWRlbnRpdHkgbWV0YWRhdGEgZm9yIHRoZSBhdXRoZW50aWNhdGVkIHVzZXIuAAAAAAAAFXNldF9pZGVudGl0eV9tZXRhZGF0YQAAAAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAAhtZXRhZGF0YQAAA+wAAAAQAAAAEAAAAAEAAAAB", "AAAAAAAAADdSZXRyaWV2ZSB0aGUgdXNlciBhZGRyZXNzIGFzc29jaWF0ZWQgd2l0aCBhIHB1YmxpYyBrZXkuAAAAABZnZXRfdXNlcl9ieV9wdWJsaWNfa2V5AAAAAAABAAAAAAAAAApwdWJsaWNfa2V5AAAAAAAQAAAAAQAAA+gAAAAT", "AAAAAAAAAFJNYXAgYSBTdGVsbGFyIHB1YmxpYyBrZXkgdG8gYSB1c2VyIGFkZHJlc3MuIE9ubHkgdGhlIGNvbnRyYWN0IG93bmVyIG1heSBjYWxsIHRoaXMuAAAAAAAWc2V0X3B1YmxpY19rZXlfbWFwcGluZwAAAAAAAgAAAAAAAAAKcHVibGljX2tleQAAAAAAEAAAAAAAAAAEdXNlcgAAABMAAAAA", "AAAAAAAAAElSZWNvcmQgYSBjb21wbGV0ZWQgcHJvamVjdC4gT25seSB0aGUgY29udHJhY3Qgb3duZXIgbWF5IGNhbGwgdGhpcy4gKCMzMTIpAAAAAAAAGXVwZGF0ZV9jb21wbGV0ZWRfcHJvamVjdHMAAAAAAAABAAAAAAAAAApmcmVlbGFuY2VyAAAAAAATAAAAAQAAAAE="]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    initialize : this.txFromJson<void>,  get_profile : this.txFromJson<FreelancerProfile>,  is_verified : this.txFromJson<boolean>,  update_rating : this.txFromJson<boolean>,  update_earnings : this.txFromJson<boolean>,  verify_freelancer : this.txFromJson<boolean>,  register_freelancer : this.txFromJson<boolean>,  get_freelancers_count : this.txFromJson<number>,  get_identity_metadata : this.txFromJson<IdentityMetadata>,  set_identity_metadata : this.txFromJson<boolean>,  get_user_by_public_key : this.txFromJson<string | null>,  set_public_key_mapping : this.txFromJson<void>,  update_completed_projects : this.txFromJson<boolean>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

}