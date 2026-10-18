/**
 * Stellar address parsing with no React Native dependencies, so it can be
 * unit-tested without a device runtime.
 */

/** A Stellar public key: "G" followed by 55 base32 characters. */
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/** Extract a Stellar public key from arbitrary scanned text. */
export function extractStellarAddress(rawData: string): string | null {
  const trimmed = rawData.trim();

  // Case 1: raw Stellar address (starts with G, 56 chars)
  if (STELLAR_ADDRESS.test(trimmed)) {
    return trimmed;
  }

  // Case 2: URL / deeplink with address as a query param
  try {
    const url = new URL(trimmed);
    const params = ['address', 'to', 'recipient', 'destination', 'account'];
    for (const param of params) {
      const value = url.searchParams.get(param);
      if (value && STELLAR_ADDRESS.test(value)) {
        return value;
      }
    }
    // Check if the pathname itself is an address
    const pathSegment = url.pathname.replace(/^\//, '');
    if (STELLAR_ADDRESS.test(pathSegment)) {
      return pathSegment;
    }
  } catch {
    // Not a URL — fall through
  }

  // Case 3: search for a Stellar address pattern anywhere in the string
  const match = trimmed.match(/G[A-Z2-7]{55}/);
  if (match) {
    return match[0];
  }

  return null;
}
