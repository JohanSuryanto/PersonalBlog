# Implementation Plan: Contributor Posts with Owner Approval

**Branch**: `004-contributor-posts` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-contributor-posts/spec.md`

## Summary

Any verified Google account can sign in and becomes a **contributor**. Contributors write posts that
are saved as **Pending** and appear publicly only after the **owner** (mrjoansy) approves them. Each
contributor can have at most 2 pending posts. Approving, rejecting or deleting a post frees a slot.

Approach:
- The owner is identified with an Identity role (`Owner`).
- Posts gain an `AuthorId`, two new statuses, a review note, and a `PendingSlot` column whose filtered
  unique index lets the database enforce the 2-post cap.
- The existing admin post endpoints are scoped by role, and two owner-only endpoints are added
  (approve, reject).
- The frontend shows the slot counter, a "Waiting for approval" queue for the owner, and submit-only
  editing for contributors.

## Technical Context

**Language/Version**: C# / .NET 10 (backend), TypeScript + React (frontend)

**Primary Dependencies**: ASP.NET Core minimal APIs, ASP.NET Core Identity (+ roles, already in the
schema), EF Core + Npgsql, Google auth handler. Frontend: React Router, Vite, Vitest. **No new packages.**

**Storage**: PostgreSQL (Neon in production), one new EF Core migration

**Testing**: xUnit integration tests against Testcontainers PostgreSQL (`backend/tests/Blog.Api.Tests`),
Vitest + Testing Library (frontend)

**Target Platform**: Render (API) + Vercel (frontend)

**Project Type**: Web application (frontend + backend)

**Performance Goals**: Personal-blog scale; no new performance targets

**Constraints**: The cap must hold under concurrent submissions; contributors never see or change
others' unpublished posts

**Scale/Scope**: 1 owner, tens of contributors at most

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | ✅ | Built-in Identity roles. The database index enforces the cap. One set of post endpoints. No new packages. |
| II. API-First Separation | ✅ | All rules are enforced in the backend; the frontend counter is only for display. Contract changes are listed in [contracts/api.md](contracts/api.md). Behavior change: contributors' `status` input is ignored, which is additive for the owner. |
| III. Tested Publishing Flow | ✅ | Approve, reject, cap and role tests against real PostgreSQL are required (see quickstart). |
| IV. Accessible by Default | ✅ | New buttons, counter and dialogs use the existing labelled components; the limit message is announced. |
| V. Secure Authentication | ⚠️ justified | V says "Users MUST log in to perform any write action". Contributors do log in, but this is the first time non-owner accounts exist. Mitigations: owner-only policy on approve, reject and comment moderation; per-user scoping on every post query; shared-image deletion guard (R5). Unpublished posts still never reach readers. |

**Post-design re-check**: Still passes. The only schema change is one migration that preserves data
(backfills `AuthorId`).

## Project Structure

### Documentation (this feature)

```text
specs/004-contributor-posts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/src/Blog.Api/
├── Program.cs                     # AddRoles<IdentityRole>(), "Owner" policy
├── Data/AuthorSeeder.cs           # ensure Owner role + membership
├── Data/BlogDbContext.cs          # Post.AuthorId FK, PendingSlot unique index, ReviewNote
├── Data/Migrations/*_ContributorPosts.cs
├── Models/Post.cs                 # PostStatus + Pending/Rejected, new fields
├── Endpoints/AuthEndpoints.cs     # create contributor on Google sign-in; isOwner in Me
├── Endpoints/AdminPostEndpoints.cs# role scoping, slot logic, approve/reject, image guard
├── Endpoints/PostEndpoints.cs     # byline from post writer, authorName on feed items
└── Endpoints/CommentEndpoints.cs  # owner-only admin group; badge only for Owner
backend/tests/Blog.Api.Tests/
├── BlogApiFactory.cs              # contributor client helper
└── ContributorPostTests.cs        # new

frontend/src/
├── api.ts                         # statuses, isOwner, authorName, reviewNote, approve/reject
├── App.tsx                        # hide Comments nav for contributors
├── pages/AdminListPage.tsx        # owner: approval queue; contributor: own posts + n/2 counter
├── pages/EditorPage.tsx           # contributor: "Submit for approval", read-only when published, limit message
├── pages/FeedPage.tsx / components/PostCard.tsx  # per-post author name
└── components/CommentSection.tsx  # name field for non-owners
```

**Structure Decision**: Keeps the existing two deployables (`backend/`, `frontend/`) and adds no new
projects or folders.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Non-owner accounts (Principle V scope) | The feature itself | Owner-only would mean there is no feature |
