# LearningPlatform

Cross-platform learning and study application. See [`PLAN.md`](./PLAN.md) for
the full architecture, and `PLAN.md §3` for the repository layout this
monorepo follows.

## Prerequisites

- Node.js 22 (LTS) — via [nvm](https://github.com/nvm-sh/nvm): `nvm use`
- pnpm — managed via Corepack, pinned in the root `package.json`
  (`packageManager` field): `corepack enable`
- Python 3.12 — via [uv](https://docs.astral.sh/uv/): `uv python install 3.12`
- [uv](https://docs.astral.sh/uv/) for the FastAPI backend

## Quickstart

```bash
# Install JS/TS dependencies for the whole workspace
pnpm install

# Web app (Next.js)
pnpm dev:web

# Mobile app (Expo)
pnpm dev:mobile

# Backend API (FastAPI)
cd services/api
uv sync
uv run uvicorn app.main:app --reload
```

## Repository layout

```text
apps/       Next.js web app and Expo mobile app
packages/   Shared TypeScript packages (contracts, validation, domain types, UI, config, test utils)
services/   FastAPI backend
infra/      Supabase config, deployment, environment docs
docs/       Architecture, API, and operations documentation
```

## Common scripts

Run from the repo root:

```bash
pnpm lint         # lint all workspaces
pnpm typecheck    # typecheck all workspaces
pnpm test         # unit/component tests across all workspaces
pnpm test:e2e     # Playwright end-to-end tests for apps/web
pnpm build        # build all workspaces
```

For `services/api`, run the equivalent checks with `uv`:

```bash
cd services/api
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest -q
```

## Architecture

### Request flow

Web and mobile both authenticate against Supabase directly, then call the
FastAPI backend with the resulting JWT. The backend verifies that JWT against
Supabase's public keys (no shared secret, no DB lookup needed to authenticate)
and talks to Postgres/Storage directly for everything else.

```mermaid
flowchart TD
    subgraph Clients
        Web["apps/web (Next.js)"]
        Mobile["apps/mobile (Expo)"]
    end

    subgraph Supabase
        Auth["Supabase Auth<br/>(issues JWT + refresh token)"]
        PG[("Postgres<br/>+ Row-Level Security")]
        Storage["Supabase Storage<br/>(documents bucket)"]
    end

    subgraph API["services/api (FastAPI)"]
        Router["Routers<br/>users / books / chapters /<br/>documents / annotations / notebook"]
        Deps["Dependencies<br/>get_current_user, require_admin"]
        Service["Services<br/>business logic"]
        ORM["SQLAlchemy models"]
    end

    Web -- "1. login" --> Auth
    Mobile -- "1. login" --> Auth
    Auth -- "access_token + refresh_token" --> Web
    Auth -- "access_token + refresh_token" --> Mobile

    Web -- "cookies (@supabase/ssr)" --> Web
    Mobile -- "SecureStore + AsyncStorage\n(AES-encrypted session)" --> Mobile

    Web -- "2. Authorization: Bearer JWT" --> Router
    Mobile -- "2. Authorization: Bearer JWT" --> Router

    Router --> Deps
    Deps -- "verify signature via JWKS" --> Auth
    Deps --> Service
    Service --> ORM
    ORM -- "direct SQL, service role,\nbypasses RLS" --> PG
    Service -- "signed URLs, upload/download" --> Storage
```

### Data model

Core domain entities and how they relate. `Profile` is the app-owned mirror
of a Supabase `auth.users` row, created lazily on a user's first authenticated
request rather than via a DB trigger.

```mermaid
classDiagram
    class Profile {
        +UUID id
        +string display_name
        +string role
    }
    class AccountSettings {
        +UUID user_id
        +string theme
        +bool notifications_enabled
    }
    class Subscription {
        +UUID id
        +string plan_code
        +string status
    }
    class Consent {
        +UUID id
        +string consent_type
    }

    class Book {
        +UUID id
        +string title
        +int order_index
    }
    class Chapter {
        +UUID id
        +UUID book_id
        +string title
    }
    class SubChapter {
        +UUID id
        +UUID chapter_id
        +string title
    }

    class Document {
        +UUID id
        +string title
        +UUID sub_chapter_id
        +UUID current_version_id
    }
    class DocumentVersion {
        +UUID id
        +UUID document_id
        +string status
        +json extracted_content
    }
    class DocumentAnnotation {
        +UUID id
        +UUID document_version_id
        +string type
        +string note_text
    }
    class LessonView {
        +UUID user_id
        +UUID document_id
        +datetime last_viewed_at
    }
    class Quiz {
        +UUID id
        +UUID document_id
    }
    class Flashcard {
        +UUID id
        +UUID document_id
        +string front_text
        +string back_text
    }
    class NotebookEntry {
        +UUID id
        +UUID user_id
        +string type
        +json strokes
        +UUID source_document_id
    }

    class Question {
        +UUID id
        +string external_id
        +UUID document_id
        +string prompt
        +string kind
        +string scoring_scheme
        +json options
        +json correct_option_ids
        +json rationales
        +string difficulty
        +string status
    }
    class Tag {
        +UUID id
        +string slug
        +string label
    }
    class QuestionTag {
        +UUID question_id
        +UUID tag_id
    }

    Profile "1" -- "1" AccountSettings
    Profile "1" -- "*" Subscription
    Profile "1" -- "*" Consent
    Profile "1" -- "*" NotebookEntry

    Book "1" -- "*" Chapter
    Chapter "1" -- "*" SubChapter
    SubChapter "1" -- "*" Document

    Document "1" -- "*" DocumentVersion
    Document "1" -- "1" DocumentVersion : current_version
    DocumentVersion "1" -- "*" DocumentAnnotation
    Document "1" -- "*" LessonView
    Document "1" -- "*" Quiz
    Document "1" -- "*" Flashcard
    Document "0..1" -- "*" NotebookEntry : source_document_id

    Profile "1" -- "*" LessonView
    Profile "1" -- "*" DocumentAnnotation

    Document "0..1" -- "*" Question : provenance
    Profile "1" -- "*" Question : created_by
    Question "1" -- "*" QuestionTag
    Tag "1" -- "*" QuestionTag
```
