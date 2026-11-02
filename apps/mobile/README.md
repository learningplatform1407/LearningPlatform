# @lp/mobile

The Expo (React Native) client. See [`/README.md`](../../README.md) for the monorepo and
[`/PLAN.md`](../../PLAN.md) for the architecture.

## Prerequisites

Install workspace dependencies from the **repo root**, not from here — this is a pnpm workspace and
the app depends on `@lp/contracts`, `@lp/validation` and friends via `workspace:*`:

```bash
pnpm install          # from the repo root
```

Copy `.env.example` to `.env` and fill in the Supabase values.

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
npx expo run:ios             # or: npx expo run:android
```

`expo-dev-client` is a dependency so those builds get the dev launcher. Neither native module needs
an Expo config plugin — standard autolinking picks both up during `prebuild` — and both support the
New Architecture that React Native 0.88 requires.

Re-run `npx expo prebuild --clean` after adding or upgrading any native dependency.

See [`docs/architecture/lecture-pdf-ink.md`](../../docs/architecture/lecture-pdf-ink.md) §8 for what
to verify on a real device the first time.

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
