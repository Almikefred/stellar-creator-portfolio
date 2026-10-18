import { isValidId, isValidOpaqueParam, isValidPeriod, resolveAllowedLink } from "./validation";

// ─── Parsed deep-link type ────────────────────────────────────────────────────

export type DeepLinkRoute =
  | { screen: "Home" }
  | { screen: "Dashboard"; params?: { period?: string } }
  | { screen: "CreatorProfile"; params: { creatorId: string } }
  | { screen: "FreelancerDirectory" }
  | { screen: "FreelancerProfile"; params: { creatorId: string } }
  | { screen: "Messaging"; params: { conversationId: string } }
  | { screen: "ImagePicker" }
  | { screen: "StreamHost"; params: { roomId: string } }
  | { screen: "StreamViewer"; params: { roomId: string } }
  | { screen: "LanguageSettings" }
  | { screen: "NotificationSettings" }
  | { screen: "BountyDetail"; params: { bountyId: string } }
  | { screen: "EmailVerification"; params?: { token?: string } }
  | { screen: "PaymentComplete"; params?: { paymentId?: string; status?: string } }
  | { screen: "Unknown"; url: string };

// ─── URL parser ───────────────────────────────────────────────────────────────

/**
 * Parses a raw deep-link URL into a typed route descriptor.
 * Handles both custom scheme (stellar://) and universal links (https://stellar.app).
 *
 * Deny-by-default (issue #1624): `resolveAllowedLink` rejects anything
 * that isn't exactly `stellar:` or an exact-match `https://stellar.app` /
 * `https://www.stellar.app` host (no substring/prefix matching — see
 * validation.ts's module doc for the host-spoofing bug that closes), and
 * every route param below is checked against a per-route-family schema
 * (`isValidId` / `isValidPeriod` / `isValidOpaqueParam`) before being
 * attached to the returned route. Anything that fails either check — bad
 * origin, unparseable URL, or a param that doesn't match its schema —
 * becomes `{ screen: 'Unknown', url }`, same as any other unrecognised
 * link, rather than a route built from unvalidated/attacker-controlled
 * input.
 *
 * @example
 *   parseDeepLink('stellar://creator/alex-studio')
 *   // → { screen: 'CreatorProfile', params: { creatorId: 'alex-studio' } }
 *
 *   parseDeepLink('https://stellar.app/freelancers')
 *   // → { screen: 'FreelancerDirectory' }
 *
 *   parseDeepLink('https://stellar.app.evil.com/creator/alex-studio')
 *   // → { screen: 'Unknown', url: '...' } — host isn't an exact match
 */
export function parseDeepLink(url: string): DeepLinkRoute {
  const resolved = resolveAllowedLink(url);
  if (!resolved) return { screen: "Unknown", url };

  const { path, query } = resolved;
  const segments = path.split("/").filter(Boolean);
  const [first, second] = segments;

  switch (first) {
    case undefined:
    case "":
      return { screen: "Home" };

    case "dashboard":
      if (second !== undefined && !isValidPeriod(second)) return { screen: "Unknown", url };
      return {
        screen: "Dashboard",
        params: second ? { period: second } : undefined,
      };

    case "creator":
      if (second === undefined) return { screen: "FreelancerDirectory" };
      if (!isValidId(second)) return { screen: "Unknown", url };
      return { screen: "CreatorProfile", params: { creatorId: second } };

    case "freelancers":
      if (second === undefined) return { screen: "FreelancerDirectory" };
      if (!isValidId(second)) return { screen: "Unknown", url };
      return { screen: "FreelancerProfile", params: { creatorId: second } };

    case "messages":
      if (second === undefined) return { screen: "Home" };
      if (!isValidId(second)) return { screen: "Unknown", url };
      return { screen: "Messaging", params: { conversationId: second } };

    case "upload":
      return { screen: "ImagePicker" };

    case "stream":
      if (!second || !isValidId(second)) return { screen: "Unknown", url };
      if (segments[2] === "host") {
        return { screen: "StreamHost", params: { roomId: second } };
      }
      return { screen: "StreamViewer", params: { roomId: second } };

    case "bounty":
      if (second === undefined) return { screen: "Home" };
      if (!isValidId(second)) return { screen: "Unknown", url };
      return { screen: "BountyDetail", params: { bountyId: second } };

    case "verify": {
      const token = query.token;
      if (token !== undefined && !isValidOpaqueParam(token)) return { screen: "Unknown", url };
      return { screen: "EmailVerification", params: token ? { token } : undefined };
    }

    case "payment": {
      if (second !== "complete") return { screen: "Home" };
      const { paymentId, status } = query;
      if (paymentId !== undefined && !isValidOpaqueParam(paymentId)) return { screen: "Unknown", url };
      if (status !== undefined && !isValidOpaqueParam(status)) return { screen: "Unknown", url };
      return {
        screen: "PaymentComplete",
        params: paymentId !== undefined || status !== undefined ? { paymentId, status } : undefined,
      };
    }

    case "settings":
      if (second === "language") return { screen: "LanguageSettings" };
      if (second === "notifications") return { screen: "NotificationSettings" };
      return { screen: "Home" };

    case "profile":
    case "activity":
    case "home":
      return { screen: "Home" };

    default:
      return { screen: "Unknown", url };
  }
}
