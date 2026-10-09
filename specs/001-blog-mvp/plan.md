# Implementation Plan: Personal Blog MVP

**Branch**: `001-blog-mvp` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-blog-mvp/spec.md`

## Summary

A personal blog with a single author who logs in to write Markdown posts with up to 10 ordered
images, and anonymous readers who browse an infinite-scroll feed, view posts with an accessible
image slider, and search/filter by publish date. A React SPA talks to an ASP.NET Core Minimal API
over same-origin JSON; data lives in Neon PostgreSQL via EF Core; images upload directly from the
browser to Cloudinary using backend-issued signatures. Feed paging is keyset-based to avoid
duplicates during scrolling. Details: [research.md](research.md).

## Technical Context

**Language/Version**: C# / .NET 10 (LTS) backend; TypeScript 5 + React 19 frontend

**Primary Dependencies**: ASP.NET Core Minimal APIs, ASP.NET Core Identity, EF Core 10 +
Npgsql provider, Microsoft.AspNetCore.OpenApi, CloudinaryDotNet; Vite, React Router, react-markdown

**Storage**: PostgreSQL (Neon in deployed environments, Docker locally); images in Cloudinary

**Testing**: xUnit + WebApplicationFactory + Testcontainers.PostgreSql (backend);
Vitest + React Testing Library + axe-core (frontend)

**Target Platform**: Backend as a Linux container; frontend as static files on a host with `/api` rewrite;
current desktop and mobile browsers

**Project Type**: Web application (frontend + backend API)

**Performance Goals**: First feed screen < 2 s on mobile 4G (SC-003); next batch < 1 s p95
(SC-004); search/filter < 1 s at 1,000 posts (SC-005)

**Constraints**: WCAG 2.2 AA; drafts never exposed; ≤ 10 images/post, ≤ 10 MB each; no secrets in source

**Scale/Scope**: 1 author, ≤ 1,000 posts, modest read traffic; ~6 screens, ~12 endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Simplicity First | Single backend project, Minimal APIs, no repository/service layers; frontend uses native IntersectionObserver, CSS scroll-snap slider, native date input. New packages each justified in research.md (Identity, EF/Npgsql, CloudinaryDotNet, react-markdown, React Router). | ✅ Pass |
| II. API-First Separation | Two deployables (`frontend/`, `backend/`); FE uses only `/api` JSON; OpenAPI via built-in package; all rules (publish, 10-image limit, draft visibility) enforced server-side. | ✅ Pass |
| III. Tested Publishing Flow | Integration tests on real Postgres (Testcontainers) for create/edit/publish/unpublish/delete/render, auth, lockout, draft visibility. | ✅ Pass |
| IV. Accessible by Default | Slider follows WAI-ARIA carousel pattern with keyboard + live counter; "Load more" fallback for infinite scroll; alt text per image; axe checks in tests. | ✅ Pass |
| V. Secure Authentication | ASP.NET Core Identity, lockout enabled, HttpOnly/Secure/SameSite cookie, no registration endpoint, server-side validation, react-markdown with raw HTML disabled, Cloudinary secret server-only, secrets via user-secrets/env. | ✅ Pass |
| Tech Constraints | React+TS, ASP.NET Core LTS, PostgreSQL, EF Core migrations, one FE + one BE + managed Postgres (Cloudinary is a managed SaaS, not added infrastructure). | ✅ Pass |

**Post-design re-check (after Phase 1)**: ✅ Pass — data model, contracts, and quickstart introduce no
additional projects, layers, or services. No violations; Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-blog-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output — HTTP API + UI routes
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
backend/
├── Blog.sln
├── src/
│   └── Blog.Api/
│       ├── Program.cs             # DI, auth, OpenAPI, endpoint mapping, author seeding
│       ├── Data/
│       │   ├── BlogDbContext.cs   # Identity + Post + PostImage
│       │   └── Migrations/
│       ├── Models/                # Post, PostImage, Author (IdentityUser)
│       ├── Endpoints/
│       │   ├── AuthEndpoints.cs
│       │   ├── PostEndpoints.cs   # public feed + detail
│       │   ├── AdminPostEndpoints.cs
│       │   └── ImageEndpoints.cs  # Cloudinary signature
│       ├── Text.cs                # slug + excerpt helpers
│       └── Dockerfile
└── tests/
    └── Blog.Api.Tests/            # WebApplicationFactory + Testcontainers Postgres

frontend/
├── package.json
├── vite.config.ts                 # dev proxy /api → backend
└── src/
    ├── main.tsx, App.tsx          # routes
    ├── api.ts                     # fetch wrappers + types
    ├── cloudinary.ts              # URL builder + signed upload
    ├── pages/
    │   ├── FeedPage.tsx           # search, date filter, infinite scroll
    │   ├── PostPage.tsx
    │   ├── LoginPage.tsx
    │   ├── AdminListPage.tsx
    │   └── EditorPage.tsx
    ├── components/
    │   ├── ImageSlider.tsx
    │   ├── PostCard.tsx
    │   └── RequireAuth.tsx
    └── hooks/
        └── useFeed.ts             # cursor paging + IntersectionObserver
    (tests colocated as *.test.tsx)
```

**Structure Decision**: Web application layout with `backend/` and `frontend/` matching the two
deployables required by Constitution II. Backend is one project (plus its test project); folders
are for navigation, not layers.

## Complexity Tracking

No constitution violations — section intentionally empty.
