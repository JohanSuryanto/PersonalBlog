---

description: "Task list for Post Comments"
---

# Tasks: Post Comments

**Input**: Design documents from `/specs/002-comments/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included. Constitution III requires integration tests on real PostgreSQL for write and
auth paths, and IV requires accessibility checks. Write each story's tests first and confirm they
fail before implementing.

**Organization**: Grouped by user story so each can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 read & write, US2 spam protection, US3 author deletes, US4 counts

## Path Conventions

- Backend: `backend/src/Blog.Api/`, tests in `backend/tests/Blog.Api.Tests/`
- Frontend: `frontend/src/`, tests colocated as `*.test.tsx`

---

## Phase 1: Setup

No new projects or packages; nothing to set up.

---

## Phase 2: Foundational (blocks all stories)

- [X] T001 [P] Create `Comment` entity in `backend/src/Blog.Api/Models/Comment.cs`: `int Id`, `int PostId`, `required string Name` ("Required, trimmed, 1–50 chars"), `required string Body` ("Required, trimmed, 1–2,000 chars, plain text, line breaks kept"), `bool IsAuthor` ("Set by the server only"), `DateTimeOffset CreatedAt`; constants `MaxNameLength = 50`, `MaxBodyLength = 2000`
- [X] T002 Add `public List<Comment> Comments { get; set; } = [];` to `backend/src/Blog.Api/Models/Post.cs`
- [X] T003 Configure in `backend/src/Blog.Api/Data/BlogDbContext.cs`: `DbSet<Comment> Comments`; `Name` max length 50, `Body` max length 2000; index `(PostId, Id)`; `Post.HasMany(Comments).WithOne().HasForeignKey(PostId).OnDelete(Cascade)`
- [X] T004 Generate migration `AddComments` with `dotnet ef migrations add AddComments -o Data/Migrations` in `backend/src/Blog.Api/` and apply it to the local DB (port 5433)
- [X] T005 [P] Add `Comment` and `CommentPage { items, hasMore }` types plus `api.comments(slug, after?)` and `api.addComment(slug, {name, body, website})` to `frontend/src/api.ts`

**Checkpoint**: Schema exists, backend builds, and the frontend types compile.

---

## Phase 3: User Story 1 - Reader reads and leaves a comment (P1) 🎯 MVP

**Goal**: Anyone can read comments (oldest first, 50 per page) and add one with a name and text on a published post.

**Independent Test**: While logged out, submit a comment on a published post, reload, and see it with the name and time.

### Tests (write first, must fail)

- [X] T006 [P] [US1] Integration tests in `backend/tests/Blog.Api.Tests/CommentTests.cs`:
  - Create returns 201 with a trimmed name and body, `isAuthor=false`, and the comment shows up in GET.
  - GET returns comments oldest first, 50 per page, with `hasMore`; `after` returns the next page.
  - Validation returns 400 for an empty/whitespace name or body, a name over 50, or a body over 2,000 (errors keyed `Name`/`Body`).
  - Draft, unpublished or missing posts return 404 for both GET and POST.
  - Body `<b>x</b>` is stored verbatim.
  - When logged in as the author, the comment has `isAuthor=true` and uses the author's display name even if another name was sent.
- [X] T007 [P] [US1] Component tests in `frontend/src/components/CommentSection.test.tsx`:
  - Renders "No comments yet" when there are none.
  - Lists comments with name, time and an "Author" badge.
  - Submitting appends the new comment, clears the text and keeps the name.
  - Shows field errors from a 400 and keeps the text.
  - Prefills the name from `localStorage` key `blog.commentName`.
  - Hides the name field when logged in.
  - "Load more comments" shows when `hasMore` and appends the next page.
  - The honeypot input is not focusable (`tabIndex=-1`, inside `aria-hidden`).
  - No axe violations.

### Implementation

- [X] T008 [US1] Create `backend/src/Blog.Api/Endpoints/CommentEndpoints.cs` with `MapCommentEndpoints`, `record CommentDto(Id, Name, Body, IsAuthor, CreatedAt)`, `record CommentPage(List<CommentDto> Items, bool HasMore)` and `record CommentInput(string? Name, string? Body, string? Website)`:
  - `GET /api/posts/{slug}/comments?after=`: published posts only, otherwise 404; `Id > after`, ordered by `Id`; take 51 to work out `hasMore`; page size 50.
  - `POST /api/posts/{slug}/comments`:
    - Published posts only, otherwise 404.
    - Trim and validate (name 1–50 unless the author is logged in, body 1–2,000).
    - If `HttpContext.User.Identity.IsAuthenticated`, set `IsAuthor=true` and use the author's DisplayName from `db.Users`.
    - Set `CreatedAt=UtcNow` and return 201.
- [X] T009 [US1] Call `app.MapCommentEndpoints()` in `backend/src/Blog.Api/Program.cs`
- [X] T010 [US1] Create `frontend/src/components/CommentSection.tsx` (props `slug`, `count`, `onCountChange`). It renders `<section id="comments" aria-labelledby>` containing:
  - **Heading:** "N comments", with singular and zero forms.
  - **List:** an `<ol>` of comments with Avatar, name, an "Author" badge, `timeAgo` in `<time dateTime>`, and the body using `white-space: pre-line`.
  - **"Load more comments" button.**
  - **Form fields:**
    - Name: `maxLength=50`, `autoComplete="nickname"`; hidden when `useAuth().user` is set.
    - Comment: a textarea with `maxLength=2000` and a remaining-characters hint below 200 left.
    - Honeypot `website` input inside a visually hidden `aria-hidden="true"` wrapper with `tabIndex=-1`.
  - **Submit:** a spinner while sending and an `aria-live="polite"` "Comment posted" message.
  - **Errors:** field errors linked with `aria-describedby`, and a general error that keeps the text.
  - **Name memory:** the name is saved to `localStorage` `blog.commentName` (wrapped in try/catch).
- [X] T011 [US1] Render `<CommentSection>` below the post in `frontend/src/pages/PostPage.tsx`, and scroll to `#comments` after load when `location.hash === '#comments'`
- [X] T012 [P] [US1] Add comment styles (`.comments`, `.comment`, `.comment-form`, `.badge-author`, `.visually-hidden-trap`) to `frontend/src/index.css` using the existing tokens, for light and dark

**Checkpoint**: US1 tests pass; a reader can read and post comments.

---

## Phase 4: User Story 2 - Spam is kept out (P1)

**Goal**: The honeypot silently discards bots, and each address is limited to 5 comments per 10 minutes.

**Independent Test**: A filled `website` returns 201 but nothing is stored; the 6th rapid POST returns 429.

### Tests (write first, must fail)

- [X] T013 [P] [US2] Add to `backend/tests/Blog.Api.Tests/CommentTests.cs`:
  - A non-empty `website` returns 201 and the GET list stays unchanged.
  - The rate-limit test uses a factory with `Comments:RateLimit:PermitLimit=2`: the 3rd POST returns 429 with a `Retry-After` header.
  - Set `Comments:RateLimit:PermitLimit=1000` in `backend/tests/Blog.Api.Tests/BlogApiFactory.cs` so other tests are not throttled.
- [X] T014 [P] [US2] Add to `frontend/src/components/CommentSection.test.tsx`: a 429 response shows "You're commenting too fast. Try again in a few minutes." and keeps the text

### Implementation

- [X] T015 [US2] In `backend/src/Blog.Api/Program.cs`, add `AddRateLimiter`:
  - Policy `"comments"`: `RateLimitPartition.GetFixedWindowLimiter` keyed by `RemoteIpAddress?.ToString() ?? "unknown"`.
  - Permit limit and window read from `Comments:RateLimit:PermitLimit` (default 5) and `WindowMinutes` (default 10), `QueueLimit=0`.
  - `RejectionStatusCode=429`; `OnRejected` sets `Retry-After` from the lease metadata.
  - Call `app.UseRateLimiter()` after auth.
  - Add the defaults to `backend/src/Blog.Api/appsettings.json`.
- [X] T016 [US2] In `backend/src/Blog.Api/Endpoints/CommentEndpoints.cs`:
  - Apply `.RequireRateLimiting("comments")` to the POST.
  - If `Website` is non-empty, return 201 with a fake `CommentDto` (id 0, trimmed input, `UtcNow`) without saving.
- [X] T017 [US2] Handle 429 in `frontend/src/components/CommentSection.tsx` with the message from T014

**Checkpoint**: US1 and US2 tests pass.

---

## Phase 5: User Story 3 - Author removes unwanted comments (P2)

**Goal**: The author deletes comments from the post page or from `/admin/comments`, and deleting a post deletes its comments.

**Independent Test**: Logged in, delete one comment on the post page and one in the dashboard; both are gone for readers.

### Tests (write first, must fail)

- [X] T018 [P] [US3] Add to `backend/tests/Blog.Api.Tests/CommentTests.cs`:
  - Anonymous `DELETE /api/admin/comments/{id}` → 401.
  - Anonymous `GET /api/admin/comments` → 401.
  - Author delete → 204, then gone from GET.
  - Unknown id → 404.
  - The admin list is newest first, 20 per page, with `post {id, slug, title, status}` (including draft posts), and paging works via `before`.
  - Deleting a post removes its comments (cascade).
- [X] T019 [P] [US3] Add to `frontend/src/components/CommentSection.test.tsx`: when logged in, each comment has a Delete button, and confirming in the dialog calls DELETE and removes the comment; anonymous readers see no Delete buttons
- [X] T020 [P] [US3] Create `frontend/src/pages/AdminCommentsPage.test.tsx`: lists comments with post links, deletes after confirm, shows the empty state, and has no axe violations

### Implementation

- [X] T021 [US3] In `backend/src/Blog.Api/Endpoints/CommentEndpoints.cs`, add the `RequireAuthorization()` group `/api/admin/comments`:
  - `GET ?before=`: newest first by `Id`, take 21 to work out `hasMore`, projected to `AdminComment(..., AdminCommentPost Post)`.
  - `DELETE /{id:int}`: 204, or 404 if missing.
- [X] T022 [US3] Add `api.adminComments(before?)` and `api.deleteComment(id)` plus the `AdminComment` type to `frontend/src/api.ts`
- [X] T023 [US3] Add an author-only Delete button per comment, using the existing `ConfirmDialog` and `Toast`, to `frontend/src/components/CommentSection.tsx`
- [X] T024 [US3] Create `frontend/src/pages/AdminCommentsPage.tsx`:
  - Header styled like the dashboard.
  - Infinite scroll via IntersectionObserver plus a "Load more" fallback.
  - Each row shows Avatar, name, an Author badge, the body clamped to 3 lines, `timeAgo`, and a link to the post (`/posts/:slug#comments`, or `/admin/posts/:id` when there is no slug).
  - Delete with confirm.
  - Empty state.
- [X] T025 [US3] Add the protected route `/admin/comments` (wrapped in `RequireAuth`, wide layout) to `frontend/src/App.tsx`, and a "Comments" link/tab in the header of `frontend/src/pages/AdminListPage.tsx`

**Checkpoint**: US1–US3 tests pass.

---

## Phase 6: User Story 4 - Comment counts (P3)

**Goal**: Feed cards and the post page show the comment count; the card count links to `#comments`.

**Independent Test**: Add 2 comments and both places show "2 comments"; delete one and both show "1 comment".

### Tests (write first, must fail)

- [X] T026 [P] [US4] Add to `backend/tests/Blog.Api.Tests/CommentTests.cs`: `GET /api/posts` items and `GET /api/posts/{slug}` include `commentCount` matching the number of comments
- [X] T027 [P] [US4] Add to `frontend/src/pages/FeedPage.test.tsx`: a card with `commentCount: 2` shows a "2 comments" link to `/posts/{slug}#comments`

### Implementation

- [X] T028 [US4] Add `int CommentCount` to `FeedItem` and `PostDetail` in `backend/src/Blog.Api/Endpoints/PostEndpoints.cs`:
  - The feed projection uses `p.Comments.Count()`.
  - The detail page fills it via `db.Comments.CountAsync(c => c.PostId == post.Id)` in the slug endpoint.
  - The admin detail can return 0.
- [X] T029 [US4] Add `commentCount` to the `FeedItem` and `PostDetail` types in `frontend/src/api.ts`, and show a comment icon plus count link in `frontend/src/components/PostCard.tsx` (add a `comment` icon to `frontend/src/components/Icon.tsx`)
- [X] T030 [US4] Pass `post.commentCount` into `CommentSection` in `frontend/src/pages/PostPage.tsx`, and keep the count in sync on add/delete via `onCountChange`; update existing test fixtures in `frontend/src/pages/*.test.tsx` that build `FeedItem`/`PostDetail` objects

**Checkpoint**: All stories done.

---

## Phase 7: Polish & Cross-Cutting

- [X] T031 [P] Update `specs/001-blog-mvp/contracts/api.md` to note the additive `commentCount` field, with a link to `specs/002-comments/contracts/api.md`
- [X] T032 [P] Add the `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` deployment note to `README.md`
- [X] T033 Run the full suites (`dotnet test` in `backend/`, then `npm test`, `npm run lint`, `npx tsc -b` and `npm run build` in `frontend/`), and fix any failures
- [ ] T034 Manual run-through of `specs/002-comments/quickstart.md` scenarios 1–11 (author)

---

## Dependencies & Execution Order

- **Foundational (T001–T005)** blocks everything. T001 and T005 can run in parallel; T002 → T003 → T004 run in order.
- **US1 (T006–T012)** is the MVP. US2 builds on its POST endpoint and form.
- **US2** depends on US1 (it modifies the same endpoint and component).
- **US3** depends on Foundational plus US1's endpoint file and component; its backend part (T018, T021) could start after Foundational.
- **US4** depends only on Foundational for the backend; its frontend part touches the PostPage wiring from US1.
- **Polish** comes last.

Story order: Foundational → US1 → US2 → US3 → US4 → Polish.

## Parallel Examples

- **Foundational**: T001 (Comment.cs) ‖ T005 (api.ts)
- **US1 tests**: T006 (CommentTests.cs) ‖ T007 (CommentSection.test.tsx); then T012 (CSS) ‖ T008 (endpoints)
- **US3 tests**: T018 ‖ T019 ‖ T020
- **US4 tests**: T026 ‖ T027

## Implementation Strategy

1. **MVP** = Foundational + US1: readers can comment. Do not deploy publicly before US2 (spam); US1 and US2 together form the first shippable increment.
2. Add US3 so the author can clean up; together with the above, this is the full P1/P2 scope.
3. Add US4 counts as a polish increment.
4. Run Phase 7 and the quickstart before merging.
