# web

The Next.js web client. See [`/README.md`](../../README.md) for the monorepo and
[`/PLAN.md`](../../PLAN.md) for the architecture.

## Prerequisites

Install workspace dependencies from the **repo root**, not from here — this is a pnpm workspace and
the app depends on `@lp/contracts`, `@lp/validation` and friends via `workspace:*`:

```bash
pnpm install          # from the repo root
```

Create `.env.local` with the variables listed in
[`infra/env/README.md`](../../infra/env/README.md).

## Running

```bash
pnpm dev:web          # from the repo root, or `pnpm dev` from here
```

Open [http://localhost:3000](http://localhost:3000).

This Next.js version differs from older releases in places; read [`AGENTS.md`](AGENTS.md) before
changing framework code.

`public/pdf.worker.min.mjs` is the vendored pdf.js worker for the lesson reader's PDF mode — see
[`docs/architecture/lecture-pdf-ink.md`](../../docs/architecture/lecture-pdf-ink.md) before
upgrading `pdfjs-dist`.

## Checks

Run from the repo root to cover every workspace, or from here for this app alone:

```bash
pnpm lint
pnpm typecheck
pnpm test             # vitest
pnpm test:e2e         # Playwright
```

## Layout

```text
src/app/          App Router routes; (app)/ is the authenticated shell
src/components/   shared UI components
src/lib/          API client, auth, i18n, theme and other helpers
src/proxy.ts      request proxy (session refresh and auth redirects)
```
