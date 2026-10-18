import { Linking } from "react-native";
import type { LinkingOptions } from "@react-navigation/native";
import type { RootStackParamList } from "../../types";
import { DEEP_LINK_CONFIG, DEEP_LINK_PREFIXES } from "./routes";
import { resolveAllowedLink } from "./validation";

// ─── Full linking options object ──────────────────────────────────────────────

/**
 * Pass this directly to <NavigationContainer linking={...} />.
 *
 * Example:
 *   import { LINKING_OPTIONS } from '../config/DeepLinkConfig';
 *   <NavigationContainer linking={LINKING_OPTIONS} ...>
 *
 * React Navigation does its own URL→route matching against `config`
 * below (`DEEP_LINK_CONFIG`), using `prefixes` the same way the old code
 * here did: a plain "does the URL start with this prefix" check. That's
 * exactly the host-spoofing gap issue #1624 is about — a URL like
 * `https://stellar.app.evil.com/creator/x` starts with the allowed
 * prefix `https://stellar.app` without being that host at all. (See
 * validation.ts's module doc; `parseDeepLink`/`useDeepLinkHandler`
 * already go through `resolveAllowedLink`'s exact-hostname check for
 * their own callers, but React Navigation's own matching is a separate
 * mechanism that doesn't call into parser.ts at all.)
 *
 * getInitialURL/subscribe below are the one choke point every URL passes
 * through before React Navigation ever sees it, so that's where this
 * gates on exact origin: a URL that doesn't pass `resolveAllowedLink` is
 * treated as "no link" (undefined / never forwarded to `listener`)
 * rather than handed to React Navigation's matcher. Per-param shape
 * validation (creatorId/conversationId/etc. format) still isn't enforced
 * for links React Navigation resolves through `config` directly — only
 * the origin is gated here — since doing that too would mean overriding
 * `getStateFromPath`, a larger change than this issue's "S" sizing
 * allows for. That's an honest, scoped-out gap, not a silent one.
 */
export const LINKING_OPTIONS: LinkingOptions<RootStackParamList> = {
  prefixes: [...DEEP_LINK_PREFIXES],
  config: DEEP_LINK_CONFIG,

  /**
   * Custom getInitialURL — handles cold-start deep links.
   * Falls back to Linking.getInitialURL(), then rejects anything not
   * from an allowed origin before handing it to React Navigation.
   */
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (!url || !resolveAllowedLink(url)) return undefined;
    return url;
  },

  /**
   * Custom subscribe — handles warm/hot-start deep links.
   * Returns an unsubscribe function as required by react-navigation.
   */
  subscribe(listener) {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (resolveAllowedLink(url)) {
        listener(url);
      }
      // else: not from an allowed origin — drop it silently, same as if
      // no link had been opened at all.
    });
    return () => subscription.remove();
  },
};
