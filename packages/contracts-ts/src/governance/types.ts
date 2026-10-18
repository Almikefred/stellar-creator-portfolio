import {Address} from '@stellar/stellar-sdk';

    /**
 * Proposal
 */
export interface Proposal {
  created_at: bigint;
  description: string;
  id: bigint;
  no_votes: bigint;
  proposer: string;
  status: string;
  title: string;
  voting_deadline: bigint;
  yes_votes: bigint;
}

/**
 * Weighted vote cast by a token holder.
 *
 * `weight` is the voter's token balance at vote time, expressed in the
 * token's smallest denomination.  Callers supply this value; a production
 * deployment would read it from an on-chain token contract.
 */
export interface TokenVote {
  proposal_id: bigint;
  vote_yes: boolean;
  voter: string;
  weight: bigint;
}

/**
 * Optional on-chain parameter change attached to a proposal.
 *
 * When a proposal carries a `ProposalParam`, `execute_timelocked` applies
 * the change directly to the governance config, creating a fully on-chain
 * parameter-update flow without requiring a separate admin transaction.
 */
export interface ProposalParam {
  /**
   * New platform fee in basis points (None = no change).
   */
  target_fee_bps: number | null;
  /**
   * New maximum bounty budget (None = no change).
   */
  target_max_budget: bigint | null;
  /**
   * New minimum bounty budget (None = no change).
   */
  target_min_budget: bigint | null;
}

/**
 * Governance Configuration
 */
export interface GovernanceConfig {
  admin_address: string;
  dispute_resolution_period: bigint;
  last_updated: bigint;
  max_bounty_budget: bigint;
  min_bounty_budget: bigint;
  platform_fee_percent: number;
}

/**
 * Execution timelock for an approved proposal.
 *
 * An approved proposal must wait `unlock_at` (ledger timestamp) before
 * `execute_timelocked` can be called.  This guards against flash-loan
 * or rushed governance attacks.
 */
export interface ExecutionTimelock {
  proposal_id: bigint;
  unlock_at: bigint;
}
    
    