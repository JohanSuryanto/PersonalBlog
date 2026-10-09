# API Contract: Post Comments

Extends [001 contract](../../001-blog-mvp/contracts/api.md): same base path, JSON, Problem
Details errors and cookie auth. 🔓 = public · 🔒 = author only (401 if not logged in).

## Shared shape: `Comment`

```json
{ "id": 41, "name": "Sam", "body": "Lovely photos!\nWhere is this?", "isAuthor": false,
  "createdAt": "2026-10-09T10:15:00Z" }
```

## Public

### 🔓 `GET /api/posts/{slug}/comments?after=`
Comments on a **published** post, oldest first, 50 per page.

| Param | Type | Rules |
|---|---|---|
| after | int, optional | Return comments with `id > after` (the last id of the previous page) |

- `200` `{ "items": [Comment], "hasMore": true }`
- `404` post missing, draft or unpublished

### 🔓 `POST /api/posts/{slug}/comments` (rate limited)
Request:
```json
{ "name": "Sam", "body": "Lovely photos!", "website": "" }
```
- `name`: required, trimmed, 1–50 chars. Ignored when the author is logged in (the author's
  display name is used and `isAuthor` is `true`).
- `body`: required, trimmed, 1–2,000 chars.
- `website`: honeypot, must be empty or missing. If filled, the response is still `201` but nothing
  is stored.

Responses:
- `201` `Comment` (Location: `/api/posts/{slug}/comments`)
- `400` validation problem, errors keyed `Name` / `Body`
- `404` post missing, draft or unpublished
- `429` too many comments from this address. `Retry-After` header in seconds; the default limit is
  5 per 10 minutes.

## Author

### 🔒 `GET /api/admin/comments?before=`
All comments on all posts, newest first, 20 per page.
- `200` `{ "items": [AdminComment], "hasMore": false, "total": 68, "lastWeek": 12 }`, where `total` and
  `lastWeek` (the last 7 days) count all comments, not just this page

```json
{ "id": 41, "name": "Sam", "body": "…", "isAuthor": false, "createdAt": "…",
  "post": { "id": 12, "slug": "hello-world", "title": "Hello world", "status": "Published",
            "coverPublicId": "blog/abc123" } }
```
`post.slug` is `null` for posts that were never published.

### 🔒 `DELETE /api/admin/comments/{id}`
- `204` deleted · `404` no such comment

## Changes to existing endpoints (additive, non-breaking)

- `GET /api/posts` items gain `"commentCount": 3`.
- `GET /api/posts/{slug}` gains `"commentCount": 3`.
- `DELETE /api/admin/posts/{id}` also deletes the post's comments (database cascade).

## UI routes

| Route | Change |
|---|---|
| `/posts/:slug#comments` | Comment section below the post: count heading, list, "Load more comments", form. Delete button per comment when logged in. |
| `/` | Feed card shows a comment count linking to `/posts/:slug#comments` |
| `/admin/comments` | New: newest comments across posts, infinite scroll, delete with confirm. Linked from the dashboard. |
