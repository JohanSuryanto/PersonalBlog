---

description: "Task list for Contributor Posts with Owner Approval"
---

# Tasks: Contributor Posts with Owner Approval

**Input**: Design documents from `/specs/004-contributor-posts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included. Constitution III requires automated tests for the publishing flow and author-only
authorization, run against real PostgreSQL (Testcontainers).

**Organization**: Grouped by user story (spec.md). US1–US3 are all P1; US4 (P2) hardens access.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from spec.md
- Paths: `backend/src/Blog.Api/`, `backend/tests/Blog.Api.Tests/`, `frontend/src/`

---

## Phase 1: Setup

No setup: no new packages or projects (plan: "No new packages").

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Owner role, the new `Post` columns, and removing the "single user" assumptions. These
must land before any non-owner account can exist.

- [X] T001 In `backend/src/Blog.Api/Models/Post.cs`:
  - Extend `public enum PostStatus { Draft, Published, Pending, Rejected }`.
  - Add `public string AuthorId { get; set; } = "";` (writer, FK → `AspNetUsers.Id`).
  - Add `public short? PendingSlot { get; set; }` with the comment "1 or 2 while Pending, else null (research R3)".
  - Add `public string? ReviewNote { get; set; }` (max 500) and `public const int MaxPendingPerContributor = 2;` and `public const int MaxReviewNoteLength = 500;`.
- [X] T002 In `backend/src/Blog.Api/Data/BlogDbContext.cs` inside `b.Entity<Post>`, add:
  - `e.HasOne<Author>().WithMany().HasForeignKey(p => p.AuthorId).OnDelete(DeleteBehavior.Restrict);`
  - `e.Property(p => p.ReviewNote).HasMaxLength(Post.MaxReviewNoteLength);`
  - `e.HasIndex(p => new { p.AuthorId, p.PendingSlot }).IsUnique().HasFilter("\"PendingSlot\" IS NOT NULL");` with a comment: "the database caps pending posts per contributor".
  - Leave `Status` as is: it is stored as a string with max length 16, so the new values fit.
- [X] T003 Generate the migration with `dotnet ef migrations add ContributorPosts` in `backend/src/Blog.Api` (output `backend/src/Blog.Api/Data/Migrations/*_ContributorPosts.cs`), then hand-edit `Up` so existing data is kept (data-model.md "Migration"):
  1. Add `AuthorId` as **nullable**.
  2. `migrationBuilder.Sql("UPDATE \"Posts\" SET \"AuthorId\" = (SELECT \"Id\" FROM \"AspNetUsers\" ORDER BY \"Id\" LIMIT 1)");`
  3. `AlterColumn` to non-nullable, then add the index and FK.
  4. Keep the generated `PendingSlot`, `ReviewNote` and filtered unique index.
  Verify with `dotnet ef database update` against the local DB on port 5433.
- [X] T004 In `backend/src/Blog.Api/Program.cs`:
  - Change `AddIdentityCore<Author>(...)` to chain `.AddRoles<IdentityRole>()` before `.AddEntityFrameworkStores<BlogDbContext>()`.
  - Replace `builder.Services.AddAuthorization();` with `builder.Services.AddAuthorization(o => o.AddPolicy(Roles.Owner, p => p.RequireRole(Roles.Owner)));`.
  - Add `public static class Roles { public const string Owner = "Owner"; }` to `backend/src/Blog.Api/Models/Author.cs`.
- [X] T005 In `backend/src/Blog.Api/Data/AuthorSeeder.cs`:
  - After finding or creating the configured author, ensure the `Owner` role exists (`RoleManager<IdentityRole>.RoleExistsAsync`/`CreateAsync`).
  - Add the author to it when `!await users.IsInRoleAsync(author, Roles.Owner)`.
  - Restructure the early `return` when the author already exists so the role step still runs. This fixes the production account on next start.
  - Update the summary comment.
- [X] T006 Replace every "first user" lookup (`db.Users.Select(u => u.DisplayName).First…`) so it works once several users exist:
  - Add `internal static Task<string> OwnerNameAsync(BlogDbContext db)` in `backend/src/Blog.Api/Endpoints/PostEndpoints.cs`. It returns the display name of the user in the `Owner` role: join `db.UserRoles` and `db.Roles` where `Name == Roles.Owner`, fallback `""`.
  - Use it for `/api/profile` (line ~29) and the RSS channel (line ~108).
  - In `ToDetailAsync` (line ~136), use the post's writer instead: `db.Users.Where(u => u.Id == post.AuthorId).Select(u => u.DisplayName).FirstOrDefaultAsync() ?? ""`.
  - Do the same in `backend/src/Blog.Api/Endpoints/PreviewEndpoints.cs` (line ~26).
  - Leave `CommentEndpoints.cs` to T036.
- [X] T007 In `backend/src/Blog.Api/Endpoints/AdminPostEndpoints.cs` `MapPost("/")`, set `AuthorId` to the current user. Add `HttpContext http` and `UserManager<Author> users` to the handler, and set `post.AuthorId = users.GetUserId(http.User)!` when creating. The owner's flow is otherwise unchanged.
- [X] T008 Update `backend/tests/Blog.Api.Tests/BlogApiFactory.cs`:
  - (a) `SeedPostAsync` gains an optional `string? authorId = null` and sets `AuthorId = authorId ?? <id of the AuthorEmail user>`.
  - (b) `FakeGoogleReturn` accepts an optional `name` query value and adds a `ClaimTypes.Name` claim. `GoogleClientAsync` gains `string? name = null` and passes it.
  - (c) Add `public async Task<HttpClient> ContributorClientAsync(string sub = "sub-c1", string email = "writer@example.com")`. It calls `GoogleClientAsync(sub, email)`, then `GET /api/auth/google/done`, asserts `302 /admin`, and returns the client (cookies kept).
  - (d) `ResetAsync`: still deletes non-author users. Confirm the `TRUNCATE` runs before the user delete, because `Posts` → `AspNetUsers` is Restrict.
- [X] T009 Run `dotnet test backend/tests/Blog.Api.Tests`. All existing tests must still pass (owner flow unchanged), except `GoogleLoginTests.Unknown_email_is_refused_and_creates_nothing`, which T013 rewrites.

**Checkpoint**: Owner works exactly as before. The schema is ready, and nothing assumes a single user.

---

## Phase 3: User Story 1 - Contributor signs in and submits a post (Priority: P1) 🎯 MVP

**Goal**: A non-owner signs in with Google, gets a contributor account, and submits posts that stay
Pending and hidden.

**Independent Test**: Sign in with a non-owner Google account and submit a post. The dashboard shows
it as "Waiting for approval" with 1/2, and it is absent from `/api/posts`.

### Tests for User Story 1

- [X] T010 [P] [US1] Create `backend/tests/Blog.Api.Tests/ContributorPostTests.cs` (`: ApiTest`) with:
  - `Contributor_post_is_saved_as_pending_even_if_published_is_requested`: POST with `status = Published` → `201`, the body `status` is `"Pending"`, and `slug` is null.
  - `Pending_post_is_not_public`: it is not in `GET /api/posts`, and `GET /api/posts/{anything}` is 404.
  - `Contributor_lists_only_own_posts`: seed one owner draft, one owner published post and one post by another contributor. The contributor's `GET /api/admin/posts` returns only their own.
  - `Contributor_cannot_read_others_post`: `GET /api/admin/posts/{owner draft id}` → `404`.
  - `Contributor_can_edit_own_pending_post_and_it_stays_pending`.
  - `Contributor_can_delete_own_pending_post`.
  - `Contributor_cannot_edit_or_delete_others_post` → `404`.
  - `Me_reports_isOwner`: owner true, contributor false.
- [X] T011 [P] [US1] In `frontend/src/pages/AdminListPage.test.tsx`, add a test: with `me` returning `isOwner: false` and a list of one Pending post, the page shows "1/2 waiting for approval", a "Waiting for approval" status, and no Comments link. In `frontend/src/pages/EditorPage.test.tsx`, add a test: a contributor sees a "Submit for approval" button and no Draft/Publish choice.

### Implementation for User Story 1

- [X] T012 [US1] In `backend/src/Blog.Api/Endpoints/AuthEndpoints.cs` (research R2):
  - Change the comment on `/google/done` to "sign in an existing account, or create a contributor for a new verified email (spec 004)".
  - When `FindByLoginAsync` is null and `FindByEmailAsync(email)` is null, and `verified` is true with a non-empty email: create `new Author { UserName = email, Email = email, EmailConfirmed = true, DisplayName = <ClaimTypes.Name claim, trimmed and cut to 100 chars, else the part of the email before '@'> }` via `users.CreateAsync(user)` (no password).
    - On failure → `log.LogWarning(...)` and `Results.Redirect("/login?error=failed")`.
    - Then `AddLoginAsync` as today and continue to `ExternalLoginSignInAsync`.
  - Unverified emails still go to `/login?error=not-allowed` with reason `email_not_verified`. Keep the "other Google account linked" refusal.
- [X] T013 [US1] In `backend/tests/Blog.Api.Tests/GoogleLoginTests.cs`:
  - Replace `Unknown_email_is_refused_and_creates_nothing` with `Unknown_verified_email_creates_a_contributor`: `302 /admin`, one new user with that email, not in the `Owner` role, `DisplayName` from the `name` claim, and `GET /api/auth/me` → `isOwner: false`.
  - Add `Unknown_unverified_email_is_refused_and_creates_nothing`.
  - Update the class comment that says no account is created.
- [X] T014 [US1] In `backend/src/Blog.Api/Endpoints/AuthEndpoints.cs`:
  - Change `MeResponse` to `record MeResponse(string Email, string DisplayName, bool IsOwner)`.
  - Fill it in `/login` and `/me` with `await users.IsInRoleAsync(user, Roles.Owner)`.
- [X] T015 [US1] In `backend/src/Blog.Api/Endpoints/AdminPostEndpoints.cs`, scope by role (contracts/api.md "Posts (admin)"):
  - Add `ClaimsPrincipal user` to the handlers; `var isOwner = user.IsInRole(Roles.Owner); var userId = users.GetUserId(user);`.
  - `GET /`: when not owner, add `.Where(p => p.AuthorId == userId)`.
  - `AdminPostSummary` gains `string AuthorName, string? ReviewNote`: join `db.Users` on `AuthorId` for `DisplayName`.
  - `GET /{id}`, `PUT /{id}`, `DELETE /{id}`: when not owner and `post.AuthorId != userId` → `404`.
  - `PUT` and `DELETE` when not owner and `post.Status == Published` → `403`.
- [X] T016 [US1] In `AdminPostEndpoints.SaveAsync` (`backend/src/Blog.Api/Endpoints/AdminPostEndpoints.cs`), add an `isOwner` parameter (data-model.md "Rules"):
  - Contributors: ignore `input.Status` and use `PostStatus.Pending`. If the post is not already Pending, set `post.PendingSlot` to the lowest of 1..`Post.MaxPendingPerContributor` not used by another `Pending` post with the same `AuthorId`. If none is free → `Results.Problem(statusCode: 409, title: "You have 2 of 2 posts waiting for approval. Wait for one to be reviewed or delete one.")` before any change.
  - Clear `ReviewNote` when a contributor resubmits.
  - Owner: reject `input.Status` of `Pending` or `Rejected` with `ValidationProblem` (`Status`: "Status must be Draft or Published.").
  - In all cases, after `post.Status = …`, set `if (post.Status != PostStatus.Pending) post.PendingSlot = null;`. Owner saving a Pending post as `Published` therefore approves it (the slug and `PublishedAt` logic already runs).
  - The `else if (input.Status == PostStatus.Draft)` branch must use the resolved status, not `input.Status`.
  - Wrap `db.SaveChangesAsync()` in `try/catch (DbUpdateException e) when (e.InnerException is Npgsql.PostgresException { SqlState: "23505" })` → the same 409 (race on a slot, research R3).
- [X] T017 [US1] In `backend/src/Blog.Api/Endpoints/PostEndpoints.cs`, `PostDetail` gains `string? ReviewNote = null`. Set it only in the admin `GET /{id}` response (`with { ReviewNote = post.ReviewNote }`). Public endpoints never set it.
- [X] T018 [P] [US1] In `frontend/src/api.ts`:
  - `PostStatus = 'Draft' | 'Published' | 'Pending' | 'Rejected'`.
  - `Me` gains `isOwner: boolean`.
  - `AdminPostSummary` gains `authorName: string; reviewNote: string | null`.
  - `PostDetail` gains `reviewNote?: string | null`.
  - Add `export const MAX_PENDING = 2`.
- [X] T019 [US1] In `frontend/src/App.tsx`, hide the admin "Comments" nav link when `!user?.isOwner`. (Done in `AdminListPage.tsx`: that's where the Comments link lives; `App.tsx` has none.)
- [X] T020 [US1] In `frontend/src/pages/AdminListPage.tsx`, when `!user.isOwner`:
  - Show a heading-level counter "`{pending}/{MAX_PENDING}` waiting for approval", where `pending` is the number of items with `status === 'Pending'`. Use an `aria-live="polite"` region.
  - Show status labels "Waiting for approval" / "Published" / "Rejected" per row, and the `reviewNote` under rejected rows.
  - Disable "New post" (with visible explanatory text, not just `disabled`) when `pending >= MAX_PENDING`.
- [X] T021 [US1] In `frontend/src/pages/EditorPage.tsx`, when `!user.isOwner`:
  - Replace the Draft/Publish controls with one "Submit for approval" button that sends `status: 'Pending'`.
  - Show a 409 response's `title` in the existing error area (announced).
  - Show the `reviewNote` above the form for Rejected posts.
  - Make the form read-only with "Published posts can only be changed by the owner" when the status is `Published`.
- [X] T022 [US1] Run `dotnet test backend/tests/Blog.Api.Tests` and `npm test` in `frontend`. T010, T011 and T013 must pass.

**Checkpoint**: Contributors can sign up and submit; nothing they write is public yet.

---

## Phase 4: User Story 2 - Pending limit of 2 per contributor (Priority: P1)

**Goal**: Never more than 2 Pending posts per contributor, and a slot is freed when a post leaves Pending.

**Independent Test**: Submit 2 posts, then a third → 409. Delete one → a new submit succeeds.

### Tests for User Story 2

- [X] T023 [P] [US2] Add to `backend/tests/Blog.Api.Tests/ContributorPostTests.cs`:
  - `Third_pending_post_is_refused_with_409_and_nothing_saved`: the title equals the contract message, and the row count is unchanged.
  - `Simultaneous_submissions_never_exceed_two`: with 1 pending, fire 3 POSTs with `Task.WhenAll`; exactly 1 succeeds and the DB has 2 Pending.
  - `Deleting_a_pending_post_frees_a_slot`.
  - `Editing_a_pending_post_does_not_use_another_slot` (at 2/2, a PUT on an existing pending post → 200).
  - `Slots_are_per_contributor` (two contributors each hold 2).

### Implementation for User Story 2

- [X] T024 [US2] Verify that T016's slot logic covers every T023 case. Fix anything in `backend/src/Blog.Api/Endpoints/AdminPostEndpoints.cs`, especially that `DELETE` needs no slot code (the row and its slot go away together) and that a PUT on an already-Pending post keeps its `PendingSlot`.
- [X] T025 [P] [US2] In `frontend/src/pages/EditorPage.tsx`, when a contributor opens `/admin/posts/new` while already at `MAX_PENDING` (fetch `api.adminPosts()` on mount for contributors), show the limit message instead of the form, with a link back to the dashboard. Add a matching test in `frontend/src/pages/EditorPage.test.tsx`.

**Checkpoint**: The cap holds, including under races.

---

## Phase 5: User Story 3 - Owner reviews and approves or rejects (Priority: P1)

**Goal**: The owner sees a queue, approves (publishes under the writer's name) or rejects with a
note, and each action frees a slot.

**Independent Test**: Approve one pending post → it is public with the contributor's name, and the
contributor is at 1/2. Reject another → the contributor sees the note and is at 0/2.

### Tests for User Story 3

- [X] T026 [P] [US3] Add to `backend/tests/Blog.Api.Tests/ContributorPostTests.cs`:
  - `Owner_approves_pending_post`: `200`, `status` is `"Published"`, the slug is set, it appears in `GET /api/posts`, `GET /api/posts/{slug}` returns `author.displayName` = the contributor's name, and the feed item's `authorName` = the contributor's name. The contributor can then submit while at 2/2 → 201.
  - `Owner_rejects_with_note`: `200`, `Rejected`, `GET /api/admin/posts/{id}` as the contributor shows the `reviewNote`, the slot is freed, and it is still not public.
  - `Reject_note_over_500_chars_is_400`.
  - `Approve_or_reject_non_pending_is_409` and `…_missing_is_404`.
  - `Contributor_resubmits_rejected_post`: PUT → `Pending`, the note is cleared, and it needs a free slot (409 at 2/2).
  - `Contributor_cannot_edit_published_post` → `403`.
  - `Owner_saving_pending_as_published_approves_it_and_frees_slot`.
  - `Owner_own_posts_publish_directly` (regression).
  - `Owner_pending_or_rejected_status_input_is_400`.
- [X] T027 [P] [US3] In `frontend/src/pages/AdminListPage.test.tsx`, add: the owner with one Pending post from "Writer" sees a "Waiting for approval" section with "Writer". Clicking Approve calls `api.approvePost(id)`. Reject opens a dialog with a labelled note field and calls `api.rejectPost(id, note)`.

### Implementation for User Story 3

- [X] T028 [US3] In `backend/src/Blog.Api/Endpoints/AdminPostEndpoints.cs`, add a group `var owner = admin.MapGroup("/").RequireAuthorization(Roles.Owner);` (or per-endpoint `.RequireAuthorization(Roles.Owner)`) with:
  - `POST /{id:int}/approve`: 404 if missing, 409 `"Only posts waiting for approval can be approved."` if not Pending. Otherwise set `Status = Published`, `PublishedAt = now`, `Slug ??= await UniqueSlugAsync(post.Title, db)`, `PendingSlot = null`, `ReviewNote = null`, `UpdatedAt = now`, save, and return `200` with `ToDetailAsync`.
  - `POST /{id:int}/reject` with `record RejectInput(string? Note)`: trim the note; if longer than `Post.MaxReviewNoteLength` → `ValidationProblem` (`Note`: "Note must be 500 characters or fewer."); 404 or 409 as above. Otherwise set `Status = Rejected`, `PendingSlot = null`, `ReviewNote = note` (empty → null), `UpdatedAt = now`, save, and return `200`.
- [X] T029 [US3] In `backend/src/Blog.Api/Endpoints/PostEndpoints.cs`, the feed item record gains `string AuthorName`. Project it with a join on `db.Users` by `AuthorId` in `GetFeed`. Keep the projection a single query.
- [X] T030 [P] [US3] In `frontend/src/api.ts`:
  - Add `approvePost: (id: number) => request<PostDetail>('POST', `/api/admin/posts/${id}/approve`)` and `rejectPost: (id: number, note: string) => request<PostDetail>('POST', `/api/admin/posts/${id}/reject`, { note })`.
  - `FeedItem` gains `authorName: string`.
- [X] T031 [US3] In `frontend/src/pages/AdminListPage.tsx`, when `user.isOwner`:
  - Add a "Waiting for approval" section above the list (only when there are Pending items). Each row shows the title (link to the editor for reading), `authorName` and the date, plus "Approve" and "Reject" buttons.
  - Reject opens the existing `frontend/src/components/ConfirmDialog.tsx` pattern with a labelled `<textarea maxLength={500}>` for the optional note.
  - After either action, reload the list and show a toast.
  - Show `authorName` on other rows when it differs from the owner's name.
- [X] T032 [US3] In `frontend/src/pages/FeedPage.tsx` / `frontend/src/components/PostCard.tsx`, pass `post.authorName` to `PostCard` instead of the profile name (the profile header still uses `profile.displayName`). Update affected tests in `frontend/src/pages/FeedPage.test.tsx` fixtures to include `authorName`.
- [X] T033 [US3] In `frontend/src/pages/EditorPage.tsx`, when the owner opens a Pending post, show "Approve" and "Reject" actions next to the existing save controls (same API calls as T031).

**Checkpoint**: The full loop works: submit → approve or reject → slot freed.

---

## Phase 6: User Story 4 - Owner keeps exclusive powers (Priority: P2)

**Goal**: Contributors cannot moderate comments, approve, or earn the Author badge.

**Independent Test**: As a contributor, `/api/admin/comments` → 403, approve → 403, and a posted
comment has `isAuthor: false`.

### Tests for User Story 4

- [X] T034 [P] [US4] Add to `backend/tests/Blog.Api.Tests/ContributorPostTests.cs`:
  - `Contributor_cannot_approve_or_reject` → `403`.
  - `Contributor_cannot_use_admin_comments` (`GET /api/admin/comments` and `DELETE /api/admin/comments/{id}` → `403`).
  - `Contributor_comment_has_no_author_badge_and_requires_name` (`isAuthor: false`; an empty name → 400).
  - `Owner_comment_still_gets_badge` (regression).
- [X] T035 [P] [US4] Add an `ImageDeletionGuard` test in `backend/tests/Blog.Api.Tests/ContributorPostTests.cs`: a contributor saves a pending post referencing the PublicId of an image on an owner post, then removes it. Assert `ImageStore` was not asked to delete it. Check how `ImageSignatureTests.cs`/`BlogApiFactory.cs` fake `ImageStore`; if it is not faked, assert that the owner's `PostImages` row still exists and add a recording fake for `ImageStore` in `BlogApiFactory.cs`.

### Implementation for User Story 4

- [X] T036 [US4] In `backend/src/Blog.Api/Endpoints/CommentEndpoints.cs`:
  - The admin group becomes `.RequireAuthorization(Roles.Owner)`.
  - In `POST /api/posts/{slug}/comments`, set `var isAuthor = http.User.IsInRole(Roles.Owner);` and `name = isAuthor ? await PostEndpoints.OwnerNameAsync(db) : input.Name…`.
- [X] T037 [US4] In `backend/src/Blog.Api/Endpoints/AdminPostEndpoints.cs` (research R5), filter the IDs passed to `imageStore.DeleteAsync(...)` in both `SaveAsync` and `DELETE` to those no longer referenced by any `PostImages` row after the save: `removed = removed.Where(id => !await db.PostImages.AnyAsync(i => i.PublicId == id))`, as one query: `var stillUsed = await db.PostImages.Where(i => removed.Contains(i.PublicId)).Select(i => i.PublicId).ToListAsync();`.
- [X] T038 [P] [US4] In `frontend/src/components/CommentSection.tsx`, treat only `user?.isOwner` as signed-in for comment purposes: use `const owner = user?.isOwner ? user : null` in place of `user` for `showNameField`, `writer` and the localStorage name save. Add a test in `frontend/src/components/CommentSection.test.tsx` that a contributor sees the name field.

**Checkpoint**: Owner-only powers are enforced and tested.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T039 [P] Update `specs/003-google-login/spec.md` Assumptions with a one-line note: "Superseded in part by spec 004: verified unknown emails now create contributor accounts."
- [X] T040 [P] Update `README.md` (if it describes login or single-author behavior) with contributors, the approval flow and the 2-post cap.
- [X] T041 Run `dotnet test backend/tests/Blog.Api.Tests` and `npm test` and `npm run build` in `frontend`; all green.
- [ ] T042 Walk through `specs/004-contributor-posts/quickstart.md` manual checks 1–8 locally. After deploying, sign out and back in once as the owner (role claim, research R1).

---

## Dependencies & Execution Order

- **Phase 2 (T001–T009)** blocks everything. Order: T001 → T002 → T003. T004 → T005. T006 and T007 after T001. T008 after T001. T009 last.
- **US1 (Phase 3)** after Phase 2. It is the MVP; the US2 and US3 phases build on its endpoints.
- **US2 (Phase 4)** after T016 (the slot logic lives there).
- **US3 (Phase 5)** after US1. It is independent of US2 except that its slot-freeing assertions assume T016.
- **US4 (Phase 6)** after Phase 2. T036 and T038 are independent of US1–US3. T037 touches the same file as T015, T016 and T028, so do it after them.
- **Polish** last.

Same-file sequences (not parallel): `AdminPostEndpoints.cs` T007 → T015 → T016 → T024 → T028 → T037. `ContributorPostTests.cs` T010 → T023 → T026 → T034 → T035. `AdminListPage.tsx` T020 → T031. `EditorPage.tsx` T021 → T025 → T033. `api.ts` T018 → T030.

## Parallel Opportunities

- Phase 2: T004/T005 (auth) alongside T001–T003 (schema).
- US1: T010 (backend tests), T011 (frontend tests) and T018 (`api.ts`) together. T012–T014 (auth) alongside T015–T017 (posts) once T018 is done for the frontend.
- US3: T026, T027 and T030 together. T029 (feed) alongside T028.
- US4: T036 and T038 alongside each other and alongside US2/US3 frontend work.

## Implementation Strategy

1. **MVP** = Phase 2 + US1 + US2 + US3 (all P1). US1 alone is safe to deploy, because pending posts
   are hidden, but contributors would wait forever without US3. Ship the P1 stories together.
2. Add US4 before inviting anyone. The comment-moderation lock (T036) and image guard (T037) are
   security fixes, so do not deploy contributor sign-up publicly without them.
3. Polish, then deploy and re-login as the owner.
