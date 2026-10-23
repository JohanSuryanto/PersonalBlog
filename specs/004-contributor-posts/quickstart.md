# Quickstart: Contributor Posts with Owner Approval

## Prerequisites

- Local PostgreSQL (port 5433), backend and frontend running as in the
  [003 quickstart](../003-google-login/quickstart.md), with Google credentials configured.
- A second Google account that is not the owner's.
- Apply the migration: `dotnet ef database update` in `backend/src/Blog.Api`.

## Automated

```powershell
dotnet test backend/tests/Blog.Api.Tests     # requires Docker (Testcontainers)
cd frontend; npm test
```

The backend tests must cover: contributor creation through Google, the 2-slot cap (including two
simultaneous submissions), approve and reject freeing slots, contributors refused on owner-only
endpoints and on other people's posts, drafts and pending posts never shown publicly, and shared
images not being deleted.

## Manual checks

1. **Owner unchanged**: sign in as mrjoansy (password or Google). The dashboard, publishing and
   comments work as before. Existing posts show your name.
2. **Contributor sign-up**: in a private window, use "Continue with Google" with the second account.
   You land on the dashboard, which shows "0/2 waiting for approval" and no Comments link.
3. **Submit**: write a post and submit it. Status shows "Waiting for approval", the counter reads 1/2,
   and the post is not on the public feed.
4. **Cap**: submit a second post (2/2). A third submission shows the limit message and the New post
   button is disabled.
5. **Approve**: as the owner, find both posts in "Waiting for approval" and approve one. It is on the
   feed with the contributor's name, and the contributor sees 1/2.
6. **Reject**: reject the other with a note. The contributor sees "Rejected" and the note, and the
   counter is 0/2. Editing and resubmitting makes it 1/2 again.
7. **No edits after approval**: the contributor opens the approved post and it is read-only. A direct
   `PUT` returns `403`.
8. **Isolation**: as the contributor, `GET /api/admin/comments` → `403`, and
   `GET /api/admin/posts/{owner's draft id}` → `404`.
