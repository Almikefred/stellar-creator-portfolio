/**
 * Tests for deep-link validation (issue #1624).
 *
 * Before the fix, `parseDeepLink` trusted every URL unconditionally:
 * the host "allowlist" was a plain `url.startsWith(prefix)` check, which
 * is also true for a URL where the real host merely *begins with* the
 * allowed string — e.g. `https://stellar.app.evil.com/...` starts with
 * `https://stellar.app`. The first test below reproduces that exact
 * attack: it fails on the pre-fix code (the spoofed URL resolved to a
 * real `CreatorProfile` route) and passes after (resolves to `Unknown`).
 */
import { parseDeepLink } from '../config/deepLinks/parser';
import { resolveAllowedLink } from '../config/deepLinks/validation';

describe('deep link host validation (issue #1624)', () => {
  it('rejects a spoofed host that merely starts with the allowed prefix', () => {
    // The actual attack: a page under attacker control can link to this
    // and, pre-fix, the app would route it exactly like the real domain.
    const spoofed = 'https://stellar.app.evil.com/creator/alex-studio';
    expect(resolveAllowedLink(spoofed)).toBeNull();
    expect(parseDeepLink(spoofed)).toEqual({ screen: 'Unknown', url: spoofed });
  });

  it('rejects a host that is a prefix-match but not a dot-boundary subdomain', () => {
    const spoofed = 'https://stellar.appzzz.com/creator/alex-studio';
    expect(parseDeepLink(spoofed)).toEqual({ screen: 'Unknown', url: spoofed });
  });

  it('rejects an unrelated host entirely', () => {
    const url = 'https://evil.com/creator/alex-studio';
    expect(parseDeepLink(url)).toEqual({ screen: 'Unknown', url });
  });

  it('rejects a disallowed scheme (e.g. javascript:)', () => {
    const url = 'javascript:alert(1)';
    expect(parseDeepLink(url)).toEqual({ screen: 'Unknown', url });
  });

  it('rejects an unparseable URL instead of throwing', () => {
    const url = 'not a url at all';
    expect(() => parseDeepLink(url)).not.toThrow();
    expect(parseDeepLink(url)).toEqual({ screen: 'Unknown', url });
  });

  it('accepts the real custom scheme', () => {
    expect(parseDeepLink('stellar://creator/alex-studio')).toEqual({
      screen: 'CreatorProfile',
      params: { creatorId: 'alex-studio' },
    });
  });

  it('accepts the real https host and its www subdomain', () => {
    expect(parseDeepLink('https://stellar.app/freelancers')).toEqual({
      screen: 'FreelancerDirectory',
    });
    expect(parseDeepLink('https://www.stellar.app/upload')).toEqual({
      screen: 'ImagePicker',
    });
  });
});

describe('deep link param validation (issue #1624)', () => {
  it('rejects a creatorId containing characters outside the allowed charset', () => {
    const url = 'stellar://creator/alex studio<script>';
    expect(parseDeepLink(url)).toEqual({ screen: 'Unknown', url });
  });

  it('rejects an oversized creatorId instead of forwarding it to navigation', () => {
    const hugeId = 'a'.repeat(5000);
    const url = `stellar://creator/${hugeId}`;
    expect(parseDeepLink(url)).toEqual({ screen: 'Unknown', url });
  });

  it('rejects a conversationId with disallowed characters', () => {
    const url = 'stellar://messages/<script>alert(1)</script>';
    expect(parseDeepLink(url).screen).toBe('Unknown');
  });

  it('rejects an unrecognised dashboard period instead of passing it through', () => {
    const url = 'stellar://dashboard/not-a-real-period';
    expect(parseDeepLink(url)).toEqual({ screen: 'Unknown', url });
  });

  it('accepts a valid dashboard period', () => {
    expect(parseDeepLink('stellar://dashboard/30d')).toEqual({
      screen: 'Dashboard',
      params: { period: '30d' },
    });
  });

  it('accepts a valid roomId for stream routes', () => {
    expect(parseDeepLink('stellar://stream/room-123/host')).toEqual({
      screen: 'StreamHost',
      params: { roomId: 'room-123' },
    });
    expect(parseDeepLink('stellar://stream/room-123')).toEqual({
      screen: 'StreamViewer',
      params: { roomId: 'room-123' },
    });
  });
});

describe('deep link routes restored from the old DeepLinkConfig.ts duplicate (issue #1624)', () => {
  it('resolves a bounty link with a valid id', () => {
    expect(parseDeepLink('stellar://bounty/bounty-42')).toEqual({
      screen: 'BountyDetail',
      params: { bountyId: 'bounty-42' },
    });
  });

  it('rejects a bounty link with an invalid id', () => {
    const url = 'stellar://bounty/..%2f..%2fsecrets';
    expect(parseDeepLink(url).screen).toBe('Unknown');
  });

  it('resolves an email-verification link and its token query param', () => {
    expect(parseDeepLink('https://stellar.app/verify?token=abc.def-123')).toEqual({
      screen: 'EmailVerification',
      params: { token: 'abc.def-123' },
    });
  });

  it('resolves email verification with no token at all', () => {
    expect(parseDeepLink('https://stellar.app/verify')).toEqual({
      screen: 'EmailVerification',
      params: undefined,
    });
  });

  it('resolves a payment-complete link and its query params', () => {
    expect(parseDeepLink('https://stellar.app/payment/complete?paymentId=pay_1&status=completed')).toEqual({
      screen: 'PaymentComplete',
      params: { paymentId: 'pay_1', status: 'completed' },
    });
  });

  it('resolves the notification-settings route', () => {
    expect(parseDeepLink('stellar://settings/notifications')).toEqual({
      screen: 'NotificationSettings',
    });
  });
});
