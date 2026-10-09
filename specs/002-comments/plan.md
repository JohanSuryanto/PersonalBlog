# Implementation Plan: Post Comments

**Branch**: `002-comments` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-comments/spec.md`

## Summary

Anonymous readers can comment on published posts with a name and plain text. Comments go live
instantly, oldest first, 50 per page. Spam is kept out by a honeypot field and the built-in
ASP.NET Core rate limiter (5 per 10 minutes per address). The logged-in author's comments get a
server-set "Author" badge. The author can delete any comment from the post page or from a new
dashboard Comments view. Feed cards and the post page show the comment count. One new table, four
endpoints, two additive fields, no new packages. Details: [research.md](research.md).

## Technical Context

**Language/Version**: C# / .NET 10 backend; TypeScript 5 + React 19 frontend (unchanged)

**Primary Dependencies**: Existing only. ASP.NET Core built-in rate limiting
(`Microsoft.AspNetCore.RateLimiting`, in the shared framework); EF Core 10 + Npgsql.

**Storage**: PostgreSQL, with a new `Comments` table via the EF migration `AddComments`

**Testing**: xUnit + WebApplicationFactory + Testcontainers Postgres; Vitest + Testing Library + axe

**Target Platform**: Unchanged (Linux container API, static SPA)

**Project Type**: Web application (frontend + backend API)

**Performance Goals**: Post with 500 comments opens as fast as one with none (SC-005), achieved by
capping each page at 50 and loading comments separately from the post body

**Constraints**: WCAG 2.2 AA; plain text only; sender address never persisted; comments hidden when
the post is not published

**Scale/Scope**: ≤1,000 posts, modest comment volume; 1 new table, 4 endpoints, 1 new page,
1 new component

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Simplicity First | No new packages. Built-in rate limiter, id-based keyset paging, counts via subquery (no stored counter), `localStorage` for the name. Endpoints added to the existing Minimal API style in one new file. | ✅ Pass |
| II. API-First Separation | New endpoints documented in [contracts/api.md](contracts/api.md) and in OpenAPI; all rules (lengths, honeypot, rate limit, published-only, author badge) enforced in the BE. Changes to existing responses are additive only. | ✅ Pass |
| III. Tested Publishing Flow | Integration tests on real Postgres: create/list/paging, validation, honeypot, rate limit 429, draft/unpublished → 404, author badge, delete auth (401 anonymous), cascade on post delete, counts in feed/detail. | ✅ Pass |
| IV. Accessible by Default | Labelled fields, errors tied with `aria-describedby`, live region for "comment posted", honeypot removed from the tab order and accessibility tree, delete behind the existing accessible ConfirmDialog, axe tests. | ✅ Pass |
| V. Secure Authentication | **Exception noted**: anonymous visitors can write comments, while Principle V says "anonymous visitors may only read". This is justified by the user's explicit choice (anonymous, name-only comments) and mitigated by: server-side validation, plain-text output encoding, honeypot, rate limit, author-only delete, and published-only scope. All other author actions stay login-only. | ⚠️ Justified exception (see Complexity Tracking) |
| Tech Constraints | Same two deployables and Postgres; schema change via EF migration; in-memory limiter adds no infrastructure. | ✅ Pass |

**Post-design re-check (after Phase 1)**: ✅ Pass, with the one documented Principle V exception. The
design adds no projects, layers, or services. A constitution PATCH/MINOR amendment to word
Principle V as "anonymous visitors may only read published content **and post comments**" is
recommended (via `/speckit-constitution`) so the exception does not linger.

## Project Structure

### Documentation (this feature)

```text
specs/002-comments/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (changes only)

```text
backend/src/Blog.Api/
├── Program.cs                      # + AddRateLimiter("comments"), UseRateLimiter, MapCommentEndpoints
├── appsettings.json                # + Comments:RateLimit { PermitLimit: 5, WindowMinutes: 10 }
├── Models/Comment.cs               # new
├── Models/Post.cs                  # + List<Comment> Comments
├── Data/BlogDbContext.cs           # + Comments set, lengths, (PostId, Id) index, cascade
├── Data/Migrations/*_AddComments   # new
└── Endpoints/
    ├── CommentEndpoints.cs         # new: public list/create + admin list/delete
    └── PostEndpoints.cs            # + CommentCount on FeedItem and PostDetail
backend/tests/Blog.Api.Tests/
└── CommentTests.cs                 # new

frontend/src/
├── api.ts                          # + Comment types, comment calls, commentCount fields
├── components/CommentSection.tsx   # new: list, load more, form, delete (+ .test.tsx)
├── components/PostCard.tsx         # + comment count link
├── pages/PostPage.tsx              # + <CommentSection>, scroll to #comments
├── pages/AdminCommentsPage.tsx     # new (+ .test.tsx)
├── pages/AdminListPage.tsx         # + link to Comments
├── App.tsx                         # + /admin/comments route
└── index.css                       # + comment styles
```

**Structure Decision**: Same two-deployable layout as 001. Comment endpoints get their own file
because they serve both public and admin routes, mirroring the existing per-area endpoint files.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Principle V: anonymous write (comment create) | User explicitly chose name-only comments with no reader accounts | Reader accounts or OAuth were offered and declined; they add registration, password reset and identity storage for a personal blog |
