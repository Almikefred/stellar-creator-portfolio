/**
 * DeepLinkConfig — Issue #543
 * "Configure standard Deep-Linking logic enabling URL interceptions globally"
 *
 * Supported deep-link patterns:
 *   stellar://creator/:id          → CreatorProfile screen
 *   stellar://freelancers          → FreelancerDirectory screen
 *   stellar://freelancers/:id      → CreatorProfile screen (freelancer view)
 *   stellar://dashboard            → Dashboard screen
 *   stellar://messages/:id         → Messaging screen
 *   stellar://upload               → ImagePicker screen
 *   stellar://bounty/:id           → BountyDetail screen
 *   stellar://verify?token=...     → EmailVerification screen
 *   stellar://payment/complete     → PaymentComplete screen
 *   stellar://settings/notifications → NotificationSettings screen
 *
 * Universal links (HTTPS):
 *   https://stellar.app/creator/:id
 *   https://stellar.app/freelancers
 *   https://stellar.app/dashboard
 *   https://stellar.app/messages/:id
 *   https://stellar.app/upload
 *   https://stellar.app/bounty/:id
 *   https://stellar.app/verify
 *   https://stellar.app/payment/complete
 *
 * This file used to carry a full, standalone copy of the deep-link logic
 * (prefixes, path map, parser, hook, builders) alongside re-exports of
 * the exact same names from ./deepLinks/* below — two declarations of
 * `DEEP_LINK_PREFIXES`, `DEEP_LINK_CONFIG`, `LINKING_OPTIONS`,
 * `DeepLinkRoute`, `parseDeepLink` and `useDeepLinkHandler` in one
 * module, which is a duplicate-export error under TypeScript's isolated
 * modules / `tsc` (and mobile/ has no CI typecheck job wired up today —
 * see issue #1627/#1628's CI work for the i18n equivalent of that gap —
 * so nothing had caught it). It also meant the copy that was actually
 * live — the one `AppNavigator.tsx` got via `import { LINKING_OPTIONS }
 * from "../config/DeepLinkConfig"` — was the OLD inline implementation,
 * not the validated ./deepLinks/ module below. Fixing #1624's reported
 * host-spoofing / unvalidated-params gap in ./deepLinks/parser.ts alone
 * would not have actually reached the running app's real navigation
 * wiring. Collapsing this file down to pure re-exports (its own doc
 * comment already said that's what it was for) fixes the compile error
 * and makes AppNavigator.tsx's LINKING_OPTIONS the validated one.
 */

export { DEEP_LINK_PREFIXES, DEEP_LINK_CONFIG } from "./deepLinks/routes";
export { LINKING_OPTIONS } from "./deepLinks/linkingOptions";
export { parseDeepLink } from "./deepLinks/parser";
export type { DeepLinkRoute } from "./deepLinks/parser";
export { useDeepLinkHandler } from "./deepLinks/useDeepLinkHandler";
export { buildDeepLink, buildUniversalLink } from "./deepLinks/builders";
