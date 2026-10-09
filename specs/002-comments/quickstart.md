# Quickstart: Post Comments

Prerequisites are the same as [001 quickstart](../../001-blog-mvp/quickstart.md): Docker running,
the local Postgres container on port 5433, the API on http://localhost:5000 and the frontend on
http://localhost:5200.

## 1. Apply the migration

```powershell
cd backend\src\Blog.Api
dotnet ef database update
```
Expected: the `AddComments` migration is applied and a `Comments` table exists.

## 2. Automated checks

```powershell
cd backend; dotnet test          # includes CommentTests (real Postgres via Testcontainers)
cd ..\frontend; npm test         # includes CommentSection + AdminCommentsPage tests with axe
```
Expected: all green.

## 3. Manual scenarios

| # | Do | Expect |
|---|---|---|
| 1 | Logged out, open a post, scroll to Comments | "No comments yet" and a form with Name + Comment |
| 2 | Submit name "Sam" and text `<b>hi</b>` with two lines | Appears at the bottom at once, shown literally with the line break; still there after reload |
| 3 | Submit with an empty name | Field error, nothing saved, text kept |
| 4 | Reload and start a new comment | Name "Sam" is already filled in |
| 5 | Post 5 comments quickly, then a 6th | 6th refused with "try again in a few minutes"; text kept |
| 6 | `curl -X POST .../comments` with `"website":"x"` | `201`, but the comment does not show up |
| 7 | Feed | Card shows the comment count; clicking it opens the post at the comments |
| 8 | Log in, open the post | Name field hidden; your comment gets an "Author" badge; each comment has Delete |
| 9 | Dashboard → Comments | Newest first with post links; delete one, confirm, and it is gone from the post too |
| 10 | Unpublish the post | Its comments endpoint returns 404; republish and they are back |
| 11 | Keyboard only | Tab reaches every field and button; the honeypot is never focused |

## Deployment note

When the API runs behind a proxy, set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` so the rate limit
applies per reader, not to the proxy's single address.
