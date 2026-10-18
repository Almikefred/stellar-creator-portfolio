

    /**
 * A single price observation from the oracle network.
 */
export interface PriceData {
  /**
   * Asset price in micro-USD (6 decimal places, e.g. 1 USD = 1_000_000).
   */
  price_micro_usd: bigint;
  /**
   * Number of oracle sources that agreed on this price.
   */
  sources: number;
  /**
   * Ledger timestamp when this price was recorded.
   */
  timestamp: bigint;
}

/**
 * Result of an atomic valuation at execution time.
 */
export interface ValuationResult {
  /**
   * Price used for the conversion (micro-USD per token).
   */
  price_used: bigint;
  /**
   * Equivalent token amount at the locked-in price.
   */
  token_amount: bigint;
  /**
   * USD amount requested (micro-USD).
   */
  usd_amount_micro: bigint;
  /**
   * Whether the fallback price was used instead of the live oracle price.
   */
  used_fallback: boolean;
}
    
    