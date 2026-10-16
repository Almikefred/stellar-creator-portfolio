# Mobile E2E Tests (Maestro)

Issue #1623. Two flows, both under `.maestro/`:

- `sign-in-flow.yaml` — onboarding → register → "Sign in" link → login →
  authenticated.
- `browse-bounties-flow.yaml` — the Explore screen's search/filter and
  empty-state behaviour.

## Why "e2e" is a separate build profile

The real sign-in path (`useWalletAuth.ts`'s `fallbackToWallet`) asks an
external wallet app (Lobstr, Freighter, any WalletConnect v2 wallet) to
approve a session — there's no such app on a CI emulator (or most
developers' local emulators), and no good way to fake one at the
WalletConnect protocol level for a UI test. Rather than mocking that out
and testing something that isn't the real screen, `fallbackToWallet` has a
test-only branch, active only when `EXPO_PUBLIC_E2E_TEST_MODE=1`, that goes
through the same `connecting → awaiting_wallet → authenticated` states a
real approval would, ending on a fixed, obviously-fake test key. See the
comment on that function in `src/hooks/useWalletAuth.ts`.

`eas.json`'s `"e2e"` build profile is the only place that sets that flag —
it is never set in `development`/`preview`/`production`.

## Running locally

### Android (emulator or device)

```bash
cd mobile
npx expo prebuild --platform android
EXPO_PUBLIC_APP_VARIANT=e2e EXPO_PUBLIC_E2E_TEST_MODE=1 \
  ( cd android && ./gradlew :app:assembleDebug )
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

curl -Ls "https://get.maestro.mobile.dev" | bash  # once
maestro test .maestro/sign-in-flow.yaml
maestro test .maestro/browse-bounties-flow.yaml
```

### iOS (simulator)

```bash
cd mobile
npx expo prebuild --platform ios
EXPO_PUBLIC_APP_VARIANT=e2e EXPO_PUBLIC_E2E_TEST_MODE=1 npx expo run:ios --configuration Debug
maestro test .maestro/sign-in-flow.yaml
maestro test .maestro/browse-bounties-flow.yaml
```

(CI currently only runs the Android job — see
`.github/workflows/mobile-e2e.yml`. Add an iOS job on a `macos` runner the
same way if simulator minutes are available; the flows themselves are
platform-agnostic.)

## What isn't covered

Google sign-in (`useGoogleAuth.ts`) is not part of either flow: it isn't
wired into any screen yet (nothing in `src/screens/` or `app/` calls
`useGoogleAuth().signIn()`), and even once it is, driving a real Google
account-consent screen from a CI emulator is a different, harder problem
than this issue's "sign-in and bounty browsing" flows — it needs a test
Google account, consent-screen automation, and per-platform
`GOOGLE_*_CLIENT_ID` values, none of which exist yet. See the updated TODO
in `src/hooks/useGoogleAuth.ts`.
