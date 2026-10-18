import {Address} from '@stellar/stellar-sdk';

    /**
 * Bounty Struct
 */
export interface Bounty {
  budget: bigint;
  completed_at: bigint | null;
  created_at: bigint;
  creator: string;
  deadline: bigint;
  description: string;
  escrow_id: bigint;
  id: bigint;
  selected_freelancer: string | null;
  status: BountyStatus;
  title: string;
}

/**
 * DataKey for typed storage lookups
 */
 export type DataKey =
  { tag: "EscrowContract"; values: void };

/**
 * Bounty Error Codes
 */
export const BountyError = {
  1 : { message: "DeadlineNotPassed" },
  2 : { message: "AlreadyProcessed" },
  3 : { message: "InsufficientBalance" }
}

/**
 * Bounty Status Enum
 */
export enum BountyStatus {
  /**
   * Enum Case: Open
   */
  Open = 0,
  /**
   * Enum Case: InProgress
   */
  InProgress = 1,
  /**
   * Enum Case: Completed
   */
  Completed = 2,
  /**
   * Enum Case: Disputed
   */
  Disputed = 3,
  /**
   * Enum Case: Cancelled
   */
  Cancelled = 4,
  /**
   * Enum Case: PendingCompletion
   */
  PendingCompletion = 5
}

/**
 * Union: ReleaseCondition
 */
 export type ReleaseCondition =
  { tag: "OnCompletion"; values: void } |
  { tag: "Timelock"; values: readonly [bigint] };

/**
 * Bounty Application Struct
 */
export interface BountyApplication {
  bounty_id: bigint;
  created_at: bigint;
  freelancer: string;
  id: bigint;
  proposal: string;
  proposed_budget: bigint;
  status: string;
  timeline: bigint;
}
    
    