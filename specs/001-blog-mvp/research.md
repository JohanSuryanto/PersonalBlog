# Research: Personal Blog MVP

All Technical Context unknowns resolved below. Guiding rule: Constitution Principle I (Simplicity
First) — built-in platform/framework features before new packages.

## 1. Backend runtime & API style

- **Decision**: ASP.NET Core on .NET 10 (LTS), Minimal APIs, single project.
- **Rationale**: Constitution requires current .NET LTS. Minimal APIs cover ~12 endpoints without
  controllers or layering. Built-in `Microsoft.AspNetCore.OpenApi` satisfies the OpenAPI rule.
- **Alternatives**: Controllers (more ceremony, no gain at this size); Clean Architecture
  multi-project layout (rejected — abstractions with one implementation violate Principle I).
- **Note**: Dev machine currently has the .NET 9 SDK; install the .NET 10 SDK before implementing.

## 2. Data access & database

- **Decision**: EF Core 10 + `Npgsql.EntityFrameworkCore.PostgreSQL`, used directly from endpoints
  (no repository layer). Neon serverless Postgres in deployed environments; a local Docker
  Postgres for development and tests.
- **Rationale**: Constitution mandates EF Core + migrations. Neon is plain Postgres over TLS, so
  only the connection string differs.
- **Neon specifics**: use the **pooled** connection string for the app (`-pooler` host),
  `SSL Mode=Require`; use the **direct** (non-pooled) string for `dotnet ef database update`.
  Enable `EnableRetryOnFailure()` because Neon computes may scale to zero and cold-start.
- **Alternatives**: Dapper/raw SQL (rejected by constitution unless justified).

## 3. Authentication (single author)

- **Decision**: ASP.NET Core Identity (`AddIdentityCore` + EF stores) with **cookie** auth and a
  custom `POST /api/auth/login` that calls `SignInManager.PasswordSignInAsync(lockoutOnFailure: true)`.
  The single author account is seeded at startup from configuration (`Author:Email`,
  `Author:Password`) if it does not exist. No registration endpoint.
- **Rationale**: Constitution V requires Identity or equivalent. Identity's built-in lockout
  satisfies FR-005 (5 failures → 15 min lock). Cookies (HttpOnly, Secure, SameSite=Lax) avoid
  storing tokens in JavaScript.
- **Alternatives**: `MapIdentityApi` (rejected — exposes public `/register`, contradicts the
  single-author assumption); JWT bearer tokens (more code, token storage in browser);
  external OAuth (unneeded for one author).
- **Same-origin requirement**: cookies work without CORS when the FE calls the API on the same
  origin. Dev: Vite proxy `/api` → backend. Prod: the FE host rewrites `/api/*` to the backend
  (e.g., Vercel/Netlify rewrite or a reverse proxy). This keeps two deployables (Principle II)
  without CORS or cross-site cookie configuration.
- **CSRF**: SameSite=Lax cookie + API accepting only JSON (`application/json`) bodies for
  mutations blocks cross-site form posts; no antiforgery token needed for the MVP.

## 4. Image upload (Cloudinary)

- **Decision**: **Signed direct upload** from the browser to Cloudinary. The backend exposes
  `POST /api/images/signature` (author-only) returning a signature, timestamp, API key, cloud
  name, and folder, generated with the official `CloudinaryDotNet` SDK. The browser uploads each
  file directly to Cloudinary, then sends the returned `public_id`, `width`, `height`, `format`,
  `bytes` to the backend when saving the post.
- **Rationale**: 10 images × 10 MB would otherwise stream through the API (slow, memory heavy).
  Signature is the only server-side Cloudinary step; the API secret never leaves the backend.
- **Validation**: Client checks type (JPEG/PNG/WebP/GIF) and size (≤10 MB) before upload. The
  signature includes `allowed_formats=jpg,png,webp,gif` so Cloudinary rejects other formats.
  The backend re-validates `format` and `bytes` on save and enforces the 10-image limit.
- **Delivery**: Frontend builds Cloudinary URLs with `f_auto,q_auto,w_<size>` plus `srcset`
  (FR-015, SC-003). Plain string building; no Cloudinary JS SDK.
- **Orphans**: Images uploaded but never attached (abandoned edits) stay in Cloudinary.
  Accepted for MVP (cost negligible); removed images are deleted from Cloudinary on post save/delete
  via the SDK's `DestroyAsync`, best effort.
- **Alternatives**: Proxy upload through API (rejected, above); Cloudinary Upload Widget
  (adds a third-party UI that is hard to make WCAG AA compliant).

## 5. Infinite scroll & feed pagination

- **Decision**: **Keyset (cursor) pagination** on `(PublishedAt DESC, Id DESC)`, batch size 10.
  The API returns `items` and `nextCursor` (opaque base64 of `publishedAt|id`, null at the end).
  The frontend uses the native `IntersectionObserver` on a sentinel element plus a visible
  "Load more" button (FR-018) that does the same thing.
- **Rationale**: Offset pagination duplicates/skips posts when new ones are published mid-scroll
  (spec edge case). Keyset is stable and uses an index.
- **Alternatives**: Offset/page number (rejected — duplicates); TanStack Query
  `useInfiniteQuery` (fine but unnecessary — a small hook with `useState` + `fetch` suffices).

## 6. Search & date filter

- **Decision**: Case-insensitive substring match with `EF.Functions.ILike` on `Title` and `Body`,
  combined with optional `from`/`to` on `PublishedAt` (inclusive, interpreted as whole days in UTC).
  Search terms escaped for `%`, `_`, `\` so they match literally.
- **Rationale**: Spec says "contains keyword, case-insensitive"; SC-005 targets ≤1,000 posts, where
  a sequential ILIKE scan is well under 1 s.
- **Ceiling**: degrades past ~tens of thousands of posts; upgrade path is a `pg_trgm` GIN index
  or Postgres full-text search — a migration, no API change.
- **Alternatives**: Full-text search `tsvector` (stemming/ranking not requested; changes matching
  semantics); external search service (overkill).
- **URL state**: `?q=&from=&to=` in the browser address via React Router `useSearchParams` (FR-022).

## 7. Post body format & rendering

- **Decision**: Body stored as Markdown. Rendered with `react-markdown` (raw HTML disabled by
  default, so no XSS sanitizer needed). Author edits in a plain `<textarea>` with a preview toggle.
- **Rationale**: Spec requires headings/bold/italic/links/lists; Markdown covers this with one
  small dependency. Rich-text editors add large dependencies and accessibility work.
- **Excerpt**: First 200 characters of the body with Markdown syntax stripped, computed on save
  and stored, so the feed does not ship full bodies.
- **Alternatives**: Rich text editor (TipTap/Quill — heavy); storing HTML (needs sanitizer).

## 8. Slug generation

- **Decision**: Lowercase, ASCII-folded, hyphenated title (max 80 chars); on collision append
  `-2`, `-3`… Generated when a post is first published; kept stable on later title edits
  (FR-010 "stable address").
- **Alternatives**: Slug library (a ~10-line function suffices); ID in URL (not human-readable).

## 9. Image slider

- **Decision**: Hand-built component using CSS `scroll-snap` for swipe, Previous/Next buttons,
  ArrowLeft/ArrowRight keys, a live "3 / 7" counter (`aria-live="polite"`), and the
  `aria-roledescription="carousel"` pattern from WAI-ARIA APG.
- **Rationale**: Native scroll-snap gives touch swipe for free; avoids a carousel library and
  its accessibility gaps.
- **Alternatives**: Swiper/Embla (extra dependency; Principle I).

## 10. Frontend stack

- **Decision**: React 19 + TypeScript, built with Vite; React Router for routes; `react-markdown`.
  Native `<input type="date">` for the date filter; plain CSS (CSS modules) for styling.
- **Rationale**: Minimum set that satisfies the spec. No UI kit, no state library.

## 11. Testing

- **Decision**:
  - Backend: xUnit + `Microsoft.AspNetCore.Mvc.Testing` (`WebApplicationFactory`) +
    **Testcontainers for PostgreSQL** — real Postgres as Constitution III requires. Covers the
    full publishing flow, draft visibility, auth/lockout, 10-image limit, keyset paging, search
    and date filter. Cloudinary is replaced by a fake via DI in tests (only the signature and
    delete calls touch it).
  - Frontend: Vitest + React Testing Library for the feed hook (no duplicates, end indicator),
    the image slider (keyboard + counter), and the editor's image-limit behavior.
  - Accessibility: `axe-core` check in the frontend component tests for the feed, post page,
    and editor.
- **Alternatives**: Playwright end-to-end (valuable later; backend integration tests already
  cover the publishing flow end-to-end at the API level).

## 12. Hosting (informational, not required for MVP code)

- **Decision**: Backend as a container (Dockerfile) on any container host; frontend as static
  files on a host that supports `/api/*` rewrites; Neon for Postgres; Cloudinary for images.
- **Rationale**: Matches Technology Constraints (one FE build, one BE service, managed Postgres).
