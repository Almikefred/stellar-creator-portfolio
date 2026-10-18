import {Address} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

    /**
 * Union: DataKey
 */
 export type DataKey =
  { tag: "Proof"; values: readonly [string, Buffer] } |
  { tag: "ProofCount"; values: readonly [string] } |
  { tag: "KycAttestation"; values: readonly [string] } |
  { tag: "Admin"; values: void } |
  { tag: "Tier"; values: readonly [string] };

/**
 * Enum: KycLevel
 */
export enum KycLevel {
  /**
   * Enum Case: Basic
   */
  Basic = 0,
  /**
   * Enum Case: Enhanced
   */
  Enhanced = 1,
  /**
   * Enum Case: Institutional
   */
  Institutional = 2
}

/**
 * Struct: SocialProof
 */
export interface SocialProof {
  domain_hash: Buffer;
  owner: string;
  proof: Buffer;
  submitted_at: bigint;
  verified: boolean;
}

/**
 * Error types for identity verification operations (Issue #1341)
 */
export const IdentityError = {
  1 : { message: "Unauthorized" },
  2 : { message: "InvalidSignature" },
  3 : { message: "InvalidDomainHash" },
  4 : { message: "AlreadyVerified" },
  5 : { message: "ProofNotFound" }
}

/**
 * Struct: KycAttestation
 */
export interface KycAttestation {
  attested_at: bigint;
  expires_at: bigint;
  level: KycLevel;
  user: string;
}

/**
 * Tier attestation stored for each creator address
 */
export interface TierAttestation {
  attested_at: bigint;
  attested_by: string;
  owner: string;
  tier: VerificationTier;
}

/**
 * On-chain tier levels mirroring the DB enum.
 * Stored as u32 for compact Soroban storage.
 * NONE=0  VERIFIED=1  TRUSTED=2  ELITE=3
 */
 export type VerificationTier =
  { tag: "None"; values: void } |
  { tag: "Verified"; values: void } |
  { tag: "Trusted"; values: void } |
  { tag: "Elite"; values: void };

/**
 * Decentralized authenticity record linking an address to verified social domains (Issue #1341)
 */
export interface DomainAttestation {
  address: string;
  attested_at: bigint;
  domain_hash: Buffer;
  verified: boolean;
}
    
    