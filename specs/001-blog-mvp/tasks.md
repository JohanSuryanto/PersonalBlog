---

description: "Task list for Personal Blog MVP"
---

# Tasks: Personal Blog MVP

**Input**: Design documents from `/specs/001-blog-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included. Constitution Principle III (NON-NEGOTIABLE) requires automated tests for the
publishing flow, rendering, and auth against real PostgreSQL; Principle IV requires accessibility
checks. Write each story's tests first and confirm they fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1, US2, US3)

## Path Conventions

- Backend: `backend/src/Blog.Api/`, tests in `backend/tests/Blog.Api.Tests/`
- Frontend: `frontend/src/`, tests colocated as `*.test.tsx` / `*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create both projects and tooling

- [X] T001 Verify .NET 10 SDK is installed (`dotnet --list-sdks` shows 10.x); create `backend/Blog.sln`, web project `backend/src/Blog.Api/Blog.Api.csproj` (`dotnet new web`, net10.0), and xUnit project `backend/tests/Blog.Api.Tests/Blog.Api.Tests.csproj` referencing Blog.Api; add both to the solution
- [X] T002 Add NuGet packages to `backend/src/Blog.Api/Blog.Api.csproj`: `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.EntityFrameworkCore.Design`, `Microsoft.AspNetCore.Identity.EntityFrameworkCore`, `Microsoft.AspNetCore.OpenApi`, `CloudinaryDotNet`; add `Microsoft.AspNetCore.Mvc.Testing` and `Testcontainers.PostgreSql` to `backend/tests/Blog.Api.Tests/Blog.Api.Tests.csproj`; add `InternalsVisibleTo`/`public partial class Program {}` so tests can use WebApplicationFactory
- [X] T003 [P] Scaffold frontend with Vite React-TS template in `frontend/`; add dependencies `react-router-dom`, `react-markdown`; dev dependencies `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `axe-core`; add `"test": "vitest run"` script in `frontend/package.json`
- [X] T004 [P] Configure `frontend/vite.config.ts`: dev server proxy `/api` → `http://localhost:5000`, Vitest `environment: 'jsdom'` and setup file `frontend/src/test-setup.ts` importing `@testing-library/jest-dom`
- [X] T005 [P] Create root `.gitignore` covering `bin/`, `obj/`, `node_modules/`, `dist/`, `.env*`, `appsettings.*.local.json`, and `.claude/settings.local.json`
- [X] T006 [P] Create `backend/src/Blog.Api/appsettings.json` with non-secret defaults only: `Cloudinary:Folder = "blog"`, logging; add `backend/src/Blog.Api/appsettings.Development.json` listing the required secret keys (`ConnectionStrings:Blog`, `Cloudinary:CloudName|ApiKey|ApiSecret`, `Author:Email|Password|DisplayName`) with empty-string values, to be filled via `dotnet user-secrets`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data model, auth, and test harness every story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 [P] Create `Author : IdentityUser` with `DisplayName` (required, max 100) in `backend/src/Blog.Api/Models/Author.cs`
- [X] T008 [P] Create `Post` entity in `backend/src/Blog.Api/Models/Post.cs` with: `Id` int identity; `Title` varchar(200) "Required, trimmed, 1–200 chars"; `Slug` varchar(80) nullable "Unique when set; assigned on first publish, never changed after"; `Body` text "Required, Markdown"; `Excerpt` varchar(200) "Derived on save"; `Status` varchar(16) "`Draft` | `Published`" (C# enum stored as string); `CreatedAt`, `UpdatedAt` timestamptz; `PublishedAt` timestamptz nullable "Set when status becomes `Published`; cleared on unpublish"; navigation `List<PostImage> Images`
- [X] T009 [P] Create `PostImage` entity in `backend/src/Blog.Api/Models/PostImage.cs` with: `Id`; `PostId` FK cascade delete; `PublicId` varchar(255) required; `Position` smallint "1–10, unique per post; position 1 = cover image"; `AltText` varchar(300) nullable; `Width`, `Height` int; `Format` varchar(10) "One of `jpg`, `png`, `webp`, `gif`"; `Bytes` int "≤ 10,485,760 (10 MB)"
- [X] T010 Create `BlogDbContext : IdentityDbContext<Author>` in `backend/src/Blog.Api/Data/BlogDbContext.cs` with `DbSet<Post>`, `DbSet<PostImage>`, string conversion for `Status`, filtered unique index on `Slug` (`"Slug" IS NOT NULL`), composite index `(Status, PublishedAt DESC, Id DESC)`, unique index `(PostId, Position)`, column lengths from T008/T009
- [X] T011 Wire `backend/src/Blog.Api/Program.cs`: `AddDbContext<BlogDbContext>` with Npgsql + `EnableRetryOnFailure()` from `ConnectionStrings:Blog`; `AddIdentityCore<Author>().AddEntityFrameworkStores<BlogDbContext>().AddSignInManager()` with lockout `MaxFailedAccessAttempts = 5`, `DefaultLockoutTimeSpan = 15 min`; cookie auth (`IdentityConstants.ApplicationScheme`, HttpOnly, `SecurePolicy = Always`, `SameSite = Lax`, return 401/403 instead of redirects); `AddAuthorization` with an "Author" policy requiring an authenticated user; `AddProblemDetails`; `AddOpenApi` + `MapOpenApi` in Development
- [X] T012 Add startup author seeding in `backend/src/Blog.Api/Data/AuthorSeeder.cs` (called from `Program.cs`): if no user with `Author:Email` exists, create it with `Author:Password` and `Author:DisplayName` via `UserManager`; skip silently when config is missing in tests that seed manually
- [X] T013 Create initial EF Core migration `backend/src/Blog.Api/Data/Migrations/` via `dotnet ef migrations add Initial` and apply it at test startup only (`Database.MigrateAsync()` in the test factory), not automatically in production
- [X] T014 [P] Create test harness `backend/tests/Blog.Api.Tests/BlogApiFactory.cs`: `WebApplicationFactory<Program>` + `IAsyncLifetime` starting a `PostgreSqlContainer` (postgres:17), overriding `ConnectionStrings:Blog`, setting `Author:*` test credentials, replacing the Cloudinary service with `FakeImageStore` (records deleted public IDs); helper `LoginAsAuthorAsync(HttpClient)` that keeps cookies; helper `SeedPostAsync(...)` writing directly via `BlogDbContext`
- [X] T015 [P] Create `backend/src/Blog.Api/ImageStore.cs`: concrete class `ImageStore` (no interface) wrapping `CloudinaryDotNet.Cloudinary` with `CreateUploadSignature()` (signs `timestamp`, `folder`, `allowed_formats=jpg,png,webp,gif`) and `DeleteAsync(IEnumerable<string> publicIds)` (best effort, logs failures); mark methods `virtual` so the test `FakeImageStore` can subclass it; register as singleton reading `Cloudinary:*` config
- [X] T016 [P] Create `backend/src/Blog.Api/Text.cs` with `Slugify(string title)` (lowercase, ASCII-folded via `NormalizationForm.FormD`, non-alphanumerics → `-`, collapsed, trimmed, max 80 chars) and `Excerpt(string markdown)` (strip Markdown syntax characters/links, collapse whitespace, first 200 chars)
- [X] T017 [P] Unit tests for `Text.Slugify` and `Text.Excerpt` in `backend/tests/Blog.Api.Tests/TextTests.cs` (accents, punctuation, long titles, empty result fallback to `post`)
- [X] T018 [P] Implement auth endpoints in `backend/src/Blog.Api/Endpoints/AuthEndpoints.cs` per contracts/api.md: `POST /api/auth/login` (`PasswordSignInAsync(..., lockoutOnFailure: true)`; 200 `{email, displayName}`, 401 invalid, 423 locked with `retryAfterSeconds`), `POST /api/auth/logout` (204), `GET /api/auth/me` (200 or 401); map in `Program.cs`
- [X] T019 Auth integration tests in `backend/tests/Blog.Api.Tests/AuthTests.cs`: login success sets cookie and `/me` returns 200; wrong password → 401; 5 failures → 423; logout → `/me` 401; no registration endpoint exists (`POST /api/auth/register` → 404)
- [X] T020 [P] Create frontend API client `frontend/src/api.ts`: typed `fetch` wrappers for every endpoint in contracts/api.md (`credentials: 'same-origin'`, JSON headers, throws an `ApiError` carrying status and Problem Details), and TypeScript types `FeedItem`, `FeedPage`, `PostDetail`, `AdminPostSummary`, `PostInput`, `ImageInput`, `UploadSignature`
- [X] T021 [P] Create `frontend/src/cloudinary.ts`: `imageUrl(cloudName, publicId, width)` building `https://res.cloudinary.com/{cloud}/image/upload/f_auto,q_auto,w_{width}/{publicId}` and `srcSet(...)` for widths 400/800/1200/1600; cloud name read from `import.meta.env.VITE_CLOUDINARY_CLOUD_NAME`
- [X] T022 Create app shell and routing in `frontend/src/App.tsx` and `frontend/src/main.tsx`: routes `/`, `/posts/:slug`, `/login`, `/admin`, `/admin/posts/new`, `/admin/posts/:id` (pages may be placeholders), skip-to-content link, `<main>` landmark, visible focus styles in `frontend/src/index.css`, auth context (`frontend/src/auth.tsx`) loading `GET /api/auth/me`
- [X] T023 [P] Create `frontend/src/pages/LoginPage.tsx`: labelled email/password inputs, error text linked via `aria-describedby`, distinct messages for 401 and 423, redirect to `/admin` on success
- [X] T024 [P] Create `frontend/src/components/RequireAuth.tsx` redirecting unauthenticated users to `/login` (preserving the intended path)

**Checkpoint**: Author can log in/out; DB schema exists; test harness runs against real Postgres

---

## Phase 3: User Story 1 - Author publishes a post with images (Priority: P1) 🎯 MVP

**Goal**: Logged-in author creates, edits, drafts, publishes, unpublishes, and deletes posts with 0–10 ordered images; readers can open a published post by its address.

**Independent Test**: Log in, create a post with 3 images, publish, then open `/posts/{slug}` logged out and see text and all 3 images in the chosen order (quickstart.md US1).

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [X] T025 [P] [US1] Admin post integration tests in `backend/tests/Blog.Api.Tests/AdminPostTests.cs`: anonymous `POST/PUT/DELETE /api/admin/posts` → 401; create draft → 201; draft not returned by `GET /api/posts/{slug}` or `GET /api/posts` for anonymous; publish → slug assigned, `PublishedAt` set, visible publicly; edit published post → public detail reflects change and slug unchanged; unpublish → public detail 404, `PublishedAt` cleared; delete → 204, images passed to `FakeImageStore` delete; slug collision yields `-2`
- [X] T026 [P] [US1] Validation integration tests in `backend/tests/Blog.Api.Tests/PostValidationTests.cs`: missing title/body → 400; title of 201 chars → 400; 11 images → 400 with "maximum 10 images" message; format `pdf` → 400; bytes 10,485,761 → 400; image order preserved and positions renumbered 1..n; removing images on edit deletes them from DB and calls `FakeImageStore.DeleteAsync`
- [X] T027 [P] [US1] Public post detail test in `backend/tests/Blog.Api.Tests/PostDetailTests.cs`: published post returns body, images ordered by position, author displayName; unknown slug → 404
- [X] T028 [P] [US1] Signature endpoint test in `backend/tests/Blog.Api.Tests/ImageSignatureTests.cs`: anonymous → 401; author → 200 with `cloudName`, `apiKey`, `timestamp`, `folder`, `allowedFormats`, `signature`, and no `apiSecret` field
- [X] T029 [P] [US1] Editor component tests in `frontend/src/pages/EditorPage.test.tsx`: selecting 12 files when 0 are attached accepts 10 and shows a skipped message; non-image or >10 MB file rejected with message; reorder buttons move images and first is labelled "Cover"; axe-core reports no violations
- [X] T030 [P] [US1] Image slider tests in `frontend/src/components/ImageSlider.test.tsx`: shows "1 / 5"; Next/Previous buttons and ArrowRight/ArrowLeft change counter; counter has `aria-live="polite"`; images without alt text get "Image N of M for {title}"; single image hides controls; axe-core no violations

### Implementation for User Story 1

- [X] T031 [US1] Implement `POST /api/images/signature` (Author policy) in `backend/src/Blog.Api/Endpoints/ImageEndpoints.cs` using `ImageStore.CreateUploadSignature()`; map in `Program.cs`
- [X] T032 [US1] Implement admin endpoints in `backend/src/Blog.Api/Endpoints/AdminPostEndpoints.cs` (group `/api/admin/posts`, Author policy): `GET` list (all statuses, newest `UpdatedAt` first, with `imageCount`), `GET {id}`, `POST`, `PUT {id}`, `DELETE {id}` per contracts/api.md. Shared save logic: trim title, validate per data-model.md (title 1–200, body required, ≤10 images, format in jpg/png/webp/gif, bytes ≤ 10,485,760) returning `ValidationProblem`; compute `Excerpt` via `Text.Excerpt`; renumber image positions 1..n in submitted order; on Draft→Published set `PublishedAt = now` and assign unique slug (`Text.Slugify` + `-2`, `-3`… on collision) if null; on Published→Draft clear `PublishedAt`; diff images and call `ImageStore.DeleteAsync` for removed ones after `SaveChanges`; on delete, remove post and delete its images from Cloudinary
- [X] T033 [US1] Implement `GET /api/posts/{slug}` in `backend/src/Blog.Api/Endpoints/PostEndpoints.cs`: published only (else 404), returns detail shape from contracts/api.md with images ordered by position; map in `Program.cs`
- [X] T034 [P] [US1] Implement signed upload helper `uploadImage(file, signature)` in `frontend/src/cloudinary.ts`: POST multipart to `https://api.cloudinary.com/v1_1/{cloudName}/image/upload`, return `{publicId, width, height, format, bytes}`; client-side checks for type (`image/jpeg|png|webp|gif`) and size ≤ 10 MB before upload
- [X] T035 [US1] Implement `frontend/src/pages/EditorPage.tsx` for `/admin/posts/new` and `/admin/posts/:id`: labelled title input (maxLength 200), Markdown `<textarea>` with Write/Preview toggle (preview via `react-markdown`), file input (`accept="image/jpeg,image/png,image/webp,image/gif"`, multiple) enforcing the 10-image total with a message for skipped files, per-image upload status with Retry/Remove on failure, alt text input per image, Move up/Move down buttons (first image labelled "Cover"), buttons Save draft / Publish / Unpublish / Delete (Delete uses a confirm dialog), server validation errors shown next to fields, on 401 keep form state and show a "session expired — log in again" link that opens `/login` in a new tab
- [X] T036 [P] [US1] Implement `frontend/src/components/ImageSlider.tsx`: WAI-ARIA carousel (`role="region"`, `aria-roledescription="carousel"`, `aria-label` = post title), slides in a CSS `scroll-snap-type: x mandatory` container, Previous/Next buttons, ArrowLeft/ArrowRight handling, live counter "N / M", images via `imageUrl`/`srcSet` with `width`/`height` attributes to reserve space, fallback alt "Image N of M for {title}", controls hidden when only one image
- [X] T037 [US1] Implement `frontend/src/pages/PostPage.tsx`: fetch `GET /api/posts/:slug`, render title (`<h1>`), publish date (`<time dateTime>`), author name, `ImageSlider` when images exist, body via `react-markdown` (no raw HTML), "Post not found" view on 404
- [X] T038 [US1] Implement `frontend/src/pages/AdminListPage.tsx` at `/admin` (wrapped in `RequireAuth`): table of all posts with title, status, updated date, image count, links to edit and to the public page when published, "New post" link, Logout button

**Checkpoint**: Full publishing flow works and is tested; a published post is viewable at `/posts/{slug}`

---

## Phase 4: User Story 2 - Reader browses the post feed (Priority: P1)

**Goal**: Anonymous readers see published posts newest first, loaded 10 at a time by infinite scroll with a "Load more" fallback and an end indicator.

**Independent Test**: With 30 published posts seeded, scroll `/` to the end: all 30 appear once, newest first, no page numbers, "end of posts" shown (quickstart.md US2).

### Tests for User Story 2 ⚠️ write first, confirm they fail

- [X] T039 [P] [US2] Feed integration tests in `backend/tests/Blog.Api.Tests/FeedTests.cs`: 25 published + 3 drafts → three requests following `nextCursor` return 10/10/5 published items, newest first, no duplicates, last `nextCursor` null, no drafts; publishing a new post between page 1 and page 2 causes no duplicates or skips in page 2; items include `excerpt` and `cover` (first image) or `cover: null`; invalid cursor → 400; empty DB → `items: []`, `nextCursor: null`
- [X] T040 [P] [US2] Feed hook/page tests in `frontend/src/pages/FeedPage.test.tsx` with mocked `fetch`: initial load renders 10 cards; clicking "Load more" appends the next batch without duplicates; final batch shows "End of posts" and no further requests; empty response shows empty-state message; axe-core no violations

### Implementation for User Story 2

- [X] T041 [US2] Implement `GET /api/posts` in `backend/src/Blog.Api/Endpoints/PostEndpoints.cs`: published only, order `PublishedAt DESC, Id DESC`, take 11 to detect more, return 10 items in feed shape (id, slug, title, excerpt, publishedAt, cover) and `nextCursor` = base64(`PublishedAt` ISO-8601 + `|` + `Id`) of the 10th item or null; decode cursor and filter rows strictly after `(PublishedAt, Id)`; malformed cursor → `ValidationProblem` 400
- [X] T042 [P] [US2] Implement `frontend/src/hooks/useFeed.ts`: state `items`, `nextCursor`, `loading`, `error`, `done`; `loadMore()` guarded against concurrent calls and de-duplicating by `id`; resets when its query params change; returns a `sentinelRef` attached to an element observed by `IntersectionObserver` (rootMargin `400px`) that calls `loadMore()`
- [X] T043 [P] [US2] Implement `frontend/src/components/PostCard.tsx`: `<article>` with linked `<h2>` title to `/posts/{slug}`, `<time>` publish date, excerpt, cover image via `imageUrl`/`srcSet` with width/height and `loading="lazy"` when present
- [X] T044 [US2] Implement `frontend/src/pages/FeedPage.tsx` at `/`: list of `PostCard`s from `useFeed`, sentinel element, visible "Load more" button while more posts exist (keyboard fallback, FR-018), loading status with `aria-live="polite"`, "End of posts" indicator, empty-state message, retry button on error

**Checkpoint**: Readers can browse the full feed; US1 + US2 together form the usable MVP

---

## Phase 5: User Story 3 - Reader searches and filters posts by date (Priority: P2)

**Goal**: Keyword search (title + body, case-insensitive) and inclusive publish-date range, combined, reflected in the URL, using the same infinite feed.

**Independent Test**: Search a word in exactly 2 posts → only those 2; set a one-month range → only that month's posts; reload keeps filters (quickstart.md US3).

### Tests for User Story 3 ⚠️ write first, confirm they fail

- [X] T045 [P] [US3] Search/filter integration tests in `backend/tests/Blog.Api.Tests/SearchFilterTests.cs`: `q` matches title or body case-insensitively; drafts matching `q` never returned; `q="%"` and `q="_"` match literally; whitespace-only `q` = no filter; `from`/`to` inclusive by whole UTC day; `from > to` → 400; `q` + date range combined; paging with `nextCursor` preserves filters
- [X] T046 [P] [US3] Filter UI tests in `frontend/src/pages/FeedPage.test.tsx` (extend): typing a keyword and submitting updates the URL `?q=` and refetches; initial render reads `q`, `from`, `to` from the URL; from-after-to shows a validation message and makes no request; "Clear filters" resets URL and feed; "No posts found" message on empty filtered result

### Implementation for User Story 3

- [X] T047 [US3] Extend `GET /api/posts` in `backend/src/Blog.Api/Endpoints/PostEndpoints.cs` with `q`, `from`, `to`: trim `q`, escape `\`, `%`, `_` and apply `EF.Functions.ILike(Title, pattern) || EF.Functions.ILike(Body, pattern)` with `ESCAPE '\'`; `from` → `PublishedAt >= from 00:00 UTC`, `to` → `PublishedAt < (to + 1 day) 00:00 UTC`; `from > to` → `ValidationProblem`; add comment `// ponytail: sequential ILIKE scan, add pg_trgm GIN index if posts exceed ~10k`
- [X] T048 [US3] Add search & filter form to `frontend/src/pages/FeedPage.tsx`: labelled search input (`type="search"`), native `<input type="date">` From/To with labels, Apply and Clear filters buttons, state stored in URL via `useSearchParams`, client-side from>to validation message, "No posts found" + clear link when filtered feed is empty; pass params into `useFeed` (which resets on change) and include them in `frontend/src/api.ts` feed request

**Checkpoint**: All three stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T049 [P] Create `backend/src/Blog.Api/Dockerfile` (multi-stage .NET 10 SDK build → aspnet runtime, listen on 8080) and document env vars `ConnectionStrings__Blog` (Neon pooled string, `SSL Mode=Require`), `Cloudinary__*`, `Author__*`
- [X] T050 [P] Add frontend production `/api/*` rewrite config for the chosen static host (e.g., `frontend/vercel.json` or `frontend/public/_redirects`) pointing to the backend URL, keeping the cookie same-origin
- [X] T051 [P] Add `README.md` at repo root linking to `specs/001-blog-mvp/quickstart.md`, listing required secrets and the Neon pooled vs direct connection string rule for migrations
- [ ] T052 Run full accessibility pass per quickstart.md: Lighthouse/axe on `/`, `/posts/:slug`, `/admin/posts/new`, `/login`; keyboard-only publish flow; fix any WCAG 2.2 AA issues found in `frontend/src/`
- [ ] T053 Run `dotnet test backend` and `npm test` in `frontend/`; all green, then execute every manual scenario in `specs/001-blog-mvp/quickstart.md` and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: depends on Setup; blocks all stories
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational; independent of US1 at the API level (tests seed posts directly via `SeedPostAsync`). Frontend `PostCard` links to `/posts/:slug` (US1's `PostPage`) — works without it but the link target is a placeholder until US1 is done
- **US3 (Phase 5)**: depends on US2 (extends `GET /api/posts` and `FeedPage`)
- **Polish (Phase 6)**: after the desired stories are complete

### Within Each User Story

- Tests first and failing → backend endpoints → frontend pieces → page integration
- T032 before T035 (editor needs the API); T036 before T037 (post page uses the slider)
- T041 before T044; T042, T043 before T044
- T047 before T048

### Parallel Opportunities

- Setup: T003–T006 in parallel after T001–T002 start
- Foundational: T007–T009, T014–T018, T020, T021, T023, T024 in parallel (different files); T010 after T007–T009; T011 after T010; T013 after T011
- US1: all tests T025–T030 in parallel; T034 and T036 in parallel with backend T031–T033
- US2: T039, T040 in parallel; T042, T043 in parallel with T041
- US1 and US2 can be developed in parallel by two people after Phase 2

---

## Parallel Example: User Story 1

```text
# Tests together:
T025 AdminPostTests.cs · T026 PostValidationTests.cs · T027 PostDetailTests.cs
T028 ImageSignatureTests.cs · T029 EditorPage.test.tsx · T030 ImageSlider.test.tsx

# Then backend and independent frontend pieces together:
T031–T033 (backend endpoints)  |  T034 cloudinary.ts upload  |  T036 ImageSlider.tsx
```

## Parallel Example: User Story 2

```text
T039 FeedTests.cs · T040 FeedPage.test.tsx
then T041 GET /api/posts  |  T042 useFeed.ts  |  T043 PostCard.tsx  → T044 FeedPage.tsx
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 (US1): author can publish; post page works → **validate with quickstart US1**
3. Phase 4 (US2): feed → **validate with quickstart US2**. US1 + US2 = shippable MVP

### Incremental Delivery

1. Setup + Foundational → login works
2. + US1 → publishing works (deployable for the author)
3. + US2 → readers can browse (public MVP launch)
4. + US3 → search and date filter
5. Polish → deployment configs, a11y pass

### Deferred (not in this task list)

- Comments (planned next feature — run `/speckit-specify` when ready)
- Cleanup of orphaned Cloudinary uploads from abandoned edits
- Self-service password reset

---

## Notes

- [P] = different files, no dependency on incomplete tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- Never commit secrets; use `dotnet user-secrets` locally and env vars in deployment
