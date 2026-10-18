/**
 * Secret used to sign and verify API bearer tokens.
 *
 * There is deliberately no fallback value: a default secret that ships in
 * the source lets anyone mint valid tokens for a deployment that forgot to
 * set JWT_SECRET.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}
