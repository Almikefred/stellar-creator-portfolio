import {Address} from '@stellar/stellar-sdk';

    /**
 * Identity Registry Metadata
 */
export interface IdentityMetadata {
  address: string;
  last_updated: bigint;
  metadata: Map<string, string>;
}

/**
 * Freelancer Profile
 */
export interface FreelancerProfile {
  address: string;
  bio: string;
  completed_projects: number;
  created_at: bigint;
  discipline: string;
  name: string;
  rating: number;
  total_earnings: bigint;
  total_rating_count: number;
  verified: boolean;
}
    
    