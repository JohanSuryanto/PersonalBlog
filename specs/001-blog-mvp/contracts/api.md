# API Contract: Personal Blog MVP

Base path: `/api`. JSON only (`Content-Type: application/json`). Same-origin with the frontend.
Auth: HttpOnly session cookie set by `POST /api/auth/login`. The live OpenAPI document is served
at `/openapi/v1.json` (Development) and is the source of truth once implemented.

> **Extended by [002-comments](../../002-comments/contracts/api.md)**: feed items and post detail gain
> `commentCount`, plus comment endpoints under `/api/posts/{slug}/comments` and `/api/admin/comments`.

Errors use RFC 7807 Problem Details (`application/problem+json`); validation errors return
`400` with an `errors` map of field → messages.

🔓 = public · 🔒 = author only (401 if not logged in)

## Auth

> **Extended by [003-google-login](../../003-google-login/contracts/api.md)**: `GET /api/auth/providers`,
> `GET /api/auth/google`, `/api/auth/signin-google` and `GET /api/auth/google/done`.

### 🔓 `POST /api/auth/login`
Request: `{ "email": "a@b.c", "password": "..." }`
- `200` `{ "email": "...", "displayName": "..." }` + sets cookie
- `401` invalid credentials · `423` locked out (`retryAfterSeconds` in body)

### 🔒 `POST /api/auth/logout` → `204`, clears cookie

### 🔓 `GET /api/auth/me`
- `200` `{ "email", "displayName" }` when logged in · `401` otherwise

## Public reading

### 🔓 `GET /api/posts?cursor=&q=&from=&to=`
Published posts only, newest first, 10 per batch.

| Param | Type | Rules |
|---|---|---|
| cursor | string, optional | Opaque; from previous `nextCursor` |
| q | string, optional | Trimmed; empty/whitespace = no search; case-insensitive contains on title + body; matched literally |
| from, to | `YYYY-MM-DD`, optional | Inclusive publish-date range (UTC); `from > to` → `400` |

Response `200`:
```json
{
  "items": [
    {
      "id": 12,
      "slug": "hello-world",
      "title": "Hello world",
      "excerpt": "First 200 chars…",
      "publishedAt": "2026-10-09T08:30:00Z",
      "images": [ { "publicId": "blog/abc123", "width": 1600, "height": 1067, "altText": "Sunset" } ]
    }
  ],
  "nextCursor": "MjAyNi0xMC0wOVQwODozMDowMFp8MTI="
}
```
`images` is ordered by position (first = cover) and empty for text-only posts; the feed card shows them as a slider. `nextCursor` is `null` at the end of the feed.

### 🔓 `GET /api/posts/{slug}`
- `200`:
```json
{
  "id": 12, "slug": "hello-world", "title": "Hello world", "body": "# Markdown…",
  "publishedAt": "2026-10-09T08:30:00Z", "updatedAt": "2026-10-09T09:00:00Z",
  "author": { "displayName": "Johan" },
  "images": [ { "publicId": "blog/abc123", "position": 1, "width": 1600, "height": 1067, "altText": "Sunset" } ],
  "newer": { "slug": "next-post", "title": "Next post" },
  "older": null
}
```
- `newer` / `older`: adjacent published posts in feed order (`null` at either end).
- `404` if not found **or not published** (drafts are indistinguishable from missing for non-authors).

## Author management

### 🔒 `GET /api/admin/posts`
All posts including drafts, newest `UpdatedAt` first (no paging for MVP; single author).
`200` `[ { "id", "title", "slug", "status", "updatedAt", "publishedAt", "imageCount", "coverPublicId" } ]` (`coverPublicId` null when the post has no images)

### 🔒 `GET /api/admin/posts/{id}` → `200` full post (same shape as public detail + `status`) · `404`

### 🔒 `POST /api/admin/posts` → `201` + `Location`
### 🔒 `PUT /api/admin/posts/{id}` → `200` · `404`
Request (both):
```json
{
  "title": "Hello world",
  "body": "# Markdown…",
  "status": "Draft",
  "images": [
    { "publicId": "blog/abc123", "width": 1600, "height": 1067, "format": "jpg", "bytes": 482113, "altText": "Sunset" }
  ]
}
```
- `images` array order = display order; first = cover. Max 10.
- `status`: `Draft` | `Published`. Changing to `Published` sets publish date/slug; to `Draft` unpublishes.
- `400` on: missing title/body, title > 200, > 10 images, format not jpg/png/webp/gif, bytes > 10 MB.

### 🔒 `DELETE /api/admin/posts/{id}` → `204` · `404`
Deletes the post and its images (Cloudinary deletion best effort).

## Image upload

### 🔒 `POST /api/images/signature`
Returns parameters for a signed direct upload from the browser to Cloudinary.
`200`:
```json
{
  "cloudName": "demo", "apiKey": "123", "timestamp": 1760000000,
  "folder": "blog", "allowedFormats": "jpg,png,webp,gif", "signature": "sha1hex…"
}
```
Browser then `POST`s `multipart/form-data` to
`https://api.cloudinary.com/v1_1/{cloudName}/image/upload` with `file`, `api_key`, `timestamp`,
`folder`, `allowed_formats`, `signature`. The Cloudinary response fields `public_id`, `width`,
`height`, `format`, `bytes` are passed into the post save request.

## Frontend routes (UI contract)

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Feed with search box, date range, infinite scroll + "Load more" (`?q=&from=&to=`) |
| `/posts/:slug` | public | Post page with image slider |
| `/login` | public | Author login |
| `/admin` | author | List of all posts with status |
| `/admin/posts/new`, `/admin/posts/:id` | author | Editor: title, Markdown body + preview, image upload/reorder/alt text, Save draft / Publish / Unpublish / Delete |
