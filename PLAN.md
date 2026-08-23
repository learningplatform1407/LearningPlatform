# High-Level Implementation Plan



## 1. Purpose and Scope



This document defines the initial architecture, technology stack, repository structure, data boundaries, communication patterns, and staged implementation plan for a cross-platform learning and study application. The initial product direction prioritises local-first note-taking, persistent study materials, account-based access, document/PDF workflows, and future AI-assisted study features.



The architecture is intentionally designed as a modular monolith at the beginning: one Python backend with clear domain modules, one monorepo containing the web and mobile clients, and managed infrastructure supplied by Supabase. This keeps the first release operationally simple while leaving a path toward independent services when scale or team boundaries justify them.



## 2. Architecture Decisions



| Area | Initial choice | Rationale |

|---|---|---|

| Repository | TypeScript/Python monorepo | Keeps web, mobile, shared contracts, and backend changes coordinated |

| Web client | Next.js with TypeScript | Browser application and Vercel deployment |

| Mobile client | Expo with React Native and TypeScript | One mobile codebase for iOS and Android, with EAS builds |

| Backend | FastAPI modular monolith in Python | Strong fit for APIs, document processing, and AI integration |

| Database | Supabase Postgres | Managed relational database |

| Authentication | Supabase Auth | Central account and session layer |

| File storage | Supabase Storage | Stores PDFs and other user-owned assets |

| AI platform | Vertex AI | Embeddings, retrieval, and generative features |

| Web deployment | Vercel | Next.js hosting and CI/CD |

| API deployment | Render initially or Cloud Run later | Fast initial deployment with a GCP-native scaling path |

| Background processing | Python worker when PDF/AI workloads grow | Keeps slow jobs out of request paths |

| Analytics | BigQuery later | Avoids premature analytical infrastructure |



## 3. Repository Structure



```text

repo/

├── apps/

│   ├── web/                       # Next.js web application

│   └── mobile/                    # Expo React Native application

├── packages/

│   ├── api-client/                # Typed API client

│   ├── contracts/                 # Shared request/response types

│   ├── validation/                # Shared Zod schemas

│   ├── domain-types/              # Shared business types

│   ├── ui/                        # Truly cross-platform UI primitives

│   ├── config/                    # Shared linting and TS config

│   └── test-utils/                # Shared test helpers

├── services/

│   └── api/                       # FastAPI backend

│       ├── app/

│       │   ├── main.py

│       │   ├── core/              # Settings, security, logging

│       │   ├── db/                # SQLAlchemy and database utilities

│       │   ├── auth/

│       │   ├── users/

│       │   ├── plans/

│       │   ├── workspaces/

│       │   ├── documents/

│       │   ├── notes/

│       │   ├── study/

│       │   ├── ai/

│       │   └── common/

│       ├── migrations/            # Alembic migrations

│       └── tests/

├── infra/

│   ├── supabase/

│   ├── deployment/

│   └── env/

├── docs/

│   ├── architecture/

│   ├── api/

│   └── operations/

├── package.json

├── pnpm-workspace.yaml

└── README.md

```



Web and mobile should share contracts, API clients, validation, and domain logic, but not every visual component. Platform-specific screens remain in each application.



## 4. Libraries



### Frontend and TypeScript



- Next.js and React for the web application.

- Expo, React Native, and Expo Router for mobile navigation.

- TypeScript across frontend and shared packages.

- TanStack Query for server-state fetching, caching, retries, and invalidation.

- Zod for runtime validation at external-data and form boundaries.

- pnpm workspaces for the monorepo.

- Vitest and React Testing Library for unit/component tests.

- Playwright for web end-to-end tests.

- Expo-compatible device testing for mobile flows.



### Python Backend



- FastAPI for HTTP APIs and dependency injection.

- Pydantic Settings for typed configuration.

- Pydantic for request and response schemas.

- SQLAlchemy 2.x for persistence.

- Alembic for migrations.

- psycopg for PostgreSQL connectivity.

- Pytest and HTTPX for tests.

- Ruff for linting and formatting.

- mypy or pyright where stricter type checking is valuable.

- Celery, Dramatiq, or a Cloud Run job/worker pattern only when asynchronous processing is needed.



Supabase is the managed infrastructure layer, not a replacement for the application backend. FastAPI owns business rules and controlled data access; Supabase provides Postgres, Auth, and Storage.



## 5. Runtime Communication



```text

Web or mobile client

       |

       | HTTPS + access token

       v

FastAPI API

       |

       +--> Supabase Auth: validate identity/session

       +--> Supabase Postgres: business data

       +--> Supabase Storage: signed upload/download URLs

       +--> Vertex AI: embeddings and AI operations

```



Clients should communicate primarily with FastAPI. The API validates the authenticated user, checks ownership and plan entitlements, executes the domain operation, and returns stable shared contracts.



For large PDFs, the API issues a short-lived signed upload URL. The client uploads directly to Storage, then calls the API to register the document and start processing. A worker can extract text, chunk it, generate embeddings, and persist processing status.



## 6. Core Data Model



| Domain | Initial entities |

|---|---|

| Identity | `profiles`, `account_settings`, `consents` |

| Access | `plans`, `subscriptions`, `entitlements`, `usage_counters` |

| Organisation | `workspaces`, `workspace_members` |

| Content | `documents`, `document_versions`, `folders`, `notes`, `note_links` |

| Study | `courses`, `enrolments`, `study_materials`, `progress_records` |

| AI | `document_chunks`, `embeddings`, `ai_conversations`, `ai_usage_events` |

| Operations | `processing_jobs`, `audit_events`, `sync_changes` |



User-owned resources should include ownership or workspace relationships and timestamps. Plan capabilities should be represented as explicit entitlements rather than duplicated flags across tables.



Date of birth should be collected only for a defined product or compliance purpose. If retained, access should be restricted and consent or age-verification state should be modelled separately.



## 7. Authentication and Authorisation



Supabase Auth provides identity and sessions. Clients send access tokens to FastAPI, which verifies the token and constructs an authenticated-user context.



Authorisation should check authentication, resource ownership or workspace membership, plan entitlement, usage quota, and data sensitivity. The backend must never trust client-provided user IDs, roles, plans, or entitlements.



## 8. Initial API Surface



```text

GET    /health

GET    /v1/me

PATCH  /v1/me

GET    /v1/me/entitlements



GET    /v1/workspaces

POST   /v1/workspaces

GET    /v1/workspaces/{workspace_id}



GET    /v1/notes

POST   /v1/notes

GET    /v1/notes/{note_id}

PATCH  /v1/notes/{note_id}

DELETE /v1/notes/{note_id}

POST   /v1/notes/sync



GET    /v1/documents

POST   /v1/documents/upload-url

POST   /v1/documents/{document_id}/process

GET    /v1/documents/{document_id}

GET    /v1/documents/{document_id}/download-url



GET    /v1/study/courses

GET    /v1/study/progress

PATCH  /v1/study/progress/{material_id}



POST   /v1/ai/query

GET    /v1/ai/conversations

GET    /v1/usage

```



Routes should be grouped by domain and versioned from the start. Error responses should have a consistent code, message, and optional field-details shape.



## 9. Local-First Notes



The clients should treat the local note store as the responsive working state. Each note should have a stable client-generated identifier, a server identifier after synchronisation, revision/version information, timestamps, and sync status.



A first version can use a local SQLite-backed store on mobile and an IndexedDB-compatible store on web. TanStack Query manages server state but is not the complete offline persistence layer. Synchronisation should be explicit, idempotent, retryable, and based on revisions or changes rather than blind full-table replacement.



A practical initial conflict policy is last-write-wins for low-risk fields, with revision checks and conflict copies for edits that cannot be safely merged.



## 10. PDFs and Storage



Postgres stores document metadata, ownership, processing state, MIME type, file size, checksum, and storage object path. PDF binaries live in Supabase Storage.



```text

accounts/{account_id}/documents/{document_id}/{version_id}/original.pdf

accounts/{account_id}/documents/{document_id}/{version_id}/derived/text.json

accounts/{account_id}/documents/{document_id}/{version_id}/derived/preview.png

```



Downloads use short-lived signed URLs generated after authorisation. Derived text and embeddings follow the same access model as the source document.



## 11. Implementation Phases



### Phase 0: Decisions and Skeleton



- Confirm product terminology and domain boundaries.

- Create the monorepo, workspace configuration, and application skeleton.

- Establish linting, formatting, type checking, environment templates, and CI.

- Add health checks.



### Phase 1: Identity and Account Foundation



- Configure Supabase environments and Auth providers.

- Implement web/mobile session handling and FastAPI token verification.

- Create profiles, settings, consent, plans, subscriptions, and entitlement tables.

- Add ownership and entitlement dependencies.



### Phase 2: Notes and Local Synchronisation



- Implement notes API and local persistence.

- Add create, edit, delete, retry, and sync operations.

- Add revision checks and conflict handling.

- Test offline creation, reconnect, duplicate retry, and multi-device edits.



### Phase 3: Documents and PDFs



- Add document metadata and version tables.

- Implement signed upload/download flows.

- Add file validation, size limits, checksums, ownership checks, and processing states.

- Introduce a worker when processing duration requires it.



### Phase 4: Study Materials and Progress



- Add courses, enrolments, materials, and progress.

- Build study dashboards for web and mobile.

- Enforce enrolment and plan access server-side.



### Phase 5: AI and Retrieval



- Extract and normalise document text.

- Chunk text with source references.

- Generate Vertex AI embeddings.

- Implement retrieval scoped to the user/workspace.

- Add AI usage events, quotas, input limits, safety controls, and observability.



### Phase 6: Production Hardening



- Add structured logs, request IDs, monitoring, audit events, backups, and restore procedures.

- Review Auth, Storage, signed URLs, and tenant isolation.

- Load-test the API and processing pipeline.

- Evaluate Render-to-Cloud-Run migration using measured requirements.



## 12. Testing Strategy



| Layer | Purpose | Tooling |

|---|---|---|

| Backend unit | Domain rules and entitlement checks | Pytest |

| Backend integration | Database, Auth, and Storage flows | Pytest, HTTPX |

| Shared packages | Contracts, validation, sync algorithms | Vitest |

| Web component | Browser UI behaviour | React Testing Library |

| Web end-to-end | Login, notes, uploads, study flows | Playwright |

| Mobile component | Screen and interaction behaviour | React Native Testing Library |

| Mobile end-to-end | Device navigation and persistence | Expo-compatible device testing |

| Operational | Deployment, migrations, health checks | CI smoke tests |



The highest-value early tests cover authenticated-user context, resource ownership, entitlement enforcement, note synchronisation, signed-URL authorisation, and document-processing state transitions.



## 13. Security Baseline



- Keep secrets in managed environment variables or secret managers.

- Isolate development, staging, and production environments.

- Restrict Storage through policies and short-lived signed URLs.

- Validate all client input at API boundaries.

- Rate-limit authentication-adjacent and AI endpoints.

- Record sensitive actions through audit events without retaining unnecessary personal data.

- Define deletion and retention workflows for accounts, notes, PDFs, derived text, embeddings, and AI conversations.



## 14. First-Release Definition of Done



- Users can register, authenticate, and access only authorised account data.

- Web and mobile use the same API contracts and shared domain types.

- Notes work offline and synchronise safely after reconnection.

- PDFs upload directly through authorised signed URLs.

- Document metadata and processing status are visible.

- Entitlements and usage limits are enforced server-side.

- Core authentication, sync, access-control, and upload flows have automated tests.

- Deployment, migrations, logging, backups, and rollback procedures are documented.



## 15. Recommended Build Order



1. Monorepo and development tooling.

2. Supabase environments and authentication.

3. Database migrations and account/entitlement model.

4. FastAPI foundation and shared API contracts.

5. Notes API and local-first synchronisation.

6. Web and mobile core screens.

7. PDF upload, metadata, and processing jobs.

8. Study materials and progress.

9. Vertex AI retrieval and assistant features.

10. Production hardening and scale evaluation.



This sequence makes the database entities, authentication context, entitlement checks, and API contracts the foundation for later features, reducing rework as the application expands.