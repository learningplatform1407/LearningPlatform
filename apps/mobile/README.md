# @lp/mobile

The Expo (React Native) client. See [`/README.md`](../../README.md) for the monorepo and
[`/PLAN.md`](../../PLAN.md) for the architecture.

## Prerequisites

Install workspace dependencies from the **repo root**, not from here — this is a pnpm workspace and
the app depends on `@lp/contracts`, `@lp/validation` and friends via `workspace:*`:

```bash
pnpm install          # from the repo root
```

Create `.env` with the variables listed in
[`infra/env/README.md`](../../infra/env/README.md).

## Running

```bash
pnpm dev:mobile       # from the repo root, or `pnpm start` from here
```

### Expo Go is not enough

The lesson reader's PDF mode depends on two **bare native modules**, `react-native-pdf` and
`react-native-blob-util`. [Expo Go](https://expo.dev/go) ships a fixed set of native modules and
cannot load them, so opening a lesson that has a lecture PDF fails at the native boundary there — it
does not degrade gracefully.

Everything else in the app works in Expo Go. For the PDF reader you need a **development build**:

```bash
npx expo prebuild            # generates ios/ and android/ (gitignored)
npx expo run:android         # verified working
```

`expo-dev-client` is a dependency so those builds get the dev launcher. Neither native module needs
an Expo config plugin — standard autolinking picks both up during `prebuild` — and both support the
New Architecture that React Native 0.88 requires.

Re-run `npx expo prebuild --clean` after adding or upgrading any native dependency.

Android also needs `ANDROID_HOME` exported and an SDK current enough to offer **API 37**, which Expo
SDK 58's own modules require. See
[`docs/architecture/lecture-pdf-ink.md`](../../docs/architecture/lecture-pdf-ink.md) §8.1 — four
separate things sit between a successful `prebuild` and a rendered page, and that section lists all
of them.

### iOS runs, but four build settings decide whether it does

`npx expo run:ios --device` was first run successfully on **2026-11-08** (iPhone 16 Pro Max,
iOS 27.0.1). A toolchain requirement and four build settings make that work; one of the four still
has to be re-applied after every `prebuild`.

**Xcode 27 or newer is required**, not merely "full Xcode". `@expo/ui` calls SwiftUI's
`glassEffect()` directly — an iOS 26 SDK symbol — so Xcode 16's iOS 18 SDK cannot compile this
project at all, even though nothing in `apps/mobile/src` imports that package. `expo-glass-effect`
is fine on older SDKs by comparison: it probes via `NSClassFromString("UIGlassEffect")`.

Also check `xcode-select -p`. If it prints `/Library/Developer/CommandLineTools` then `xcodebuild`
does not exist, whatever sits in `/Applications` — point it at the app bundle instead. And if a
freshly updated Xcode refuses to launch, complaining about `/Library/Developer/PrivateFrameworks`,
those are machine-level components left behind by the _previous_ Xcode; move them aside and run
`sudo xcodebuild -runFirstLaunch` so the new version reinstalls its own.

**`apps/mobile/ios/` is gitignored**, so four build settings decide whether a device build signs
and compiles, and `npx expo prebuild` resets the ones `app.json` cannot state. Check them in
`ios/mobile.xcodeproj/project.pbxproj` (target `mobile`, both Debug and Release) before building
for a device:

| Setting                         | Value                                      | Without it                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEVELOPMENT_TEAM`              | `4SU84PFTBA` (free personal team)          | `Signing for "mobile" requires a development team`                                                                                                                                                                                                                                                    |
| `CODE_SIGN_STYLE`               | `Automatic`                                | no provisioning profile is ever issued                                                                                                                                                                                                                                                                |
| `PRODUCT_BUNDLE_IDENTIFIER`     | `com.mihneaghira.mobile` (from `app.json`) | the `com.anonymous.mobile` default is already claimed by other personal teams, so Apple rejects the App ID: `No profiles for 'com.anonymous.mobile' were found`. Xcode can also silently revert the Team selection, leaving a certificate but no team, which then reads as an unrelated signing error |
| `ENABLE_USER_SCRIPT_SANDBOXING` | `NO` (project level)                       | `Sandbox: bash deny file-write-create .../mobile.app/ip.txt` — React Native's "Bundle React Native code and images" phase writes inside the built `.app`, which Xcode's template default forbids                                                                                                      |

Verify with `xcodebuild -showBuildSettings`, which reports _effective_ values after xcconfig
layering, rather than trusting the file.

`app.json` now declares `ios.bundleIdentifier: "com.mihneaghira.mobile"`, so the identifier
survives `prebuild`, and `expo run:ios` applies `DEVELOPMENT_TEAM` and `CODE_SIGN_STYLE` itself
("Auto signing app using team(s)" in its output). **`ENABLE_USER_SCRIPT_SANDBOXING` is the one with
nowhere to live**: it has no `app.json` equivalent, Xcode's template defaults it to `YES`, and so it
has to be set back to `NO` by hand after every `prebuild`. `android.package` is still
`com.anonymous.mobile` — see TASKS_SPLIT HARDEN-10, which is now only about that and the sandboxing
plugin.

The same trap applies on Android: `prebuild` also removes `android/local.properties`, whose single
`sdk.dir=` line is what prevents `SDK location not found`.

The PDF reader itself is still Android-verified only. §8.3 of the design doc lists four things known
to differ on iOS (networking, overlay geometry, safe-area insets, Keychain-backed session storage);
the device pass exercised overlay geometry and safe-area insets — see TASKS_SPLIT DESIGN-11 and
DESIGN-12 — while the other two remain untested.

## Checks

Run from the repo root to cover every workspace, or from here for this app alone:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Layout

```text
src/app/      expo-router routes (file-based); (app)/ is the authenticated shell
src/lib/      shared clients, contexts, theme, and reusable components
```
