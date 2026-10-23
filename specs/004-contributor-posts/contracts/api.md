# API Contract: Contributor Posts with Owner Approval

Extends the [001](../../001-blog-mvp/contracts/api.md) and [003](../../003-google-login/contracts/api.md)
contracts. Only changes are listed here.

🔓 = public, 🔑 = any signed-in user, 👑 = owner only (contributor → `403`)

## Auth

### 🔓 `GET /api/auth/google/done` (changed)
- A verified Google email with no matching account now **creates a contributor** and signs them in → `302 /admin`.
- Unverified email → `302 /login?error=not-allowed` (unchanged).

### 🔑 `GET /api/auth/me` (additive)
- `200` `{ "email", "displayName", "isOwner": true|false }`

### 🔑 `POST /api/auth/login` (additive)
- Response gains `isOwner`. Contributors have no password, so in practice this is only the owner.

## Posts (admin)

`PostStatus` values: `Draft | Published | Pending | Rejected`.

### 🔑 `GET /api/admin/posts` (changed)
- Owner: all posts. Contributor: only their own.
- Each item gains `authorName` and `reviewNote` (null unless rejected).

### 🔑 `GET /api/admin/posts/{id}` (changed)
- Contributor requesting someone else's post → `404`. The detail response gains `reviewNote`.

### 🔑 `POST /api/admin/posts` / `PUT /api/admin/posts/{id}` (changed)
- Owner: unchanged (`status` `Draft` or `Published`). Saving a Pending post as `Published` counts as
  approving it. The owner may keep a post's current `Pending`/`Rejected` status while editing it, but cannot
  move a post into either (`400`).
- Contributor: `status` is ignored; the post is saved as `Pending`.
  - Not their post → `404`. Their post is `Published` → `403`.
  - Would make them exceed 2 pending posts → `409`, problem details
    `title: "You have 2 of 2 posts waiting for approval. Wait for one to be reviewed or delete one."`
  - Resubmitting a `Rejected` post needs a free slot (same `409`).

### 🔑 `DELETE /api/admin/posts/{id}` (changed)
- Contributor: only their own `Pending` or `Rejected` posts; otherwise `404`/`403`. Frees the slot.

### 👑 `POST /api/admin/posts/{id}/approve` (new)
- `200` post detail, now `Published` with a slug. `409` if the post is not `Pending`. `404` if missing.

### 👑 `POST /api/admin/posts/{id}/reject` (new)
- Body `{ "note": string | null }` (max 500 characters, trimmed).
- `200` post detail, now `Rejected`. `409` if not `Pending`. `404` if missing. `400` if the note is too long.

## Images

### 🔑 `POST /api/images/signature`: unchanged (contributors may upload).
- When a save or delete drops images, an asset still used by another post is not deleted.

## Comments

### 👑 `/api/admin/comments/*`: now owner only.
### 🔓 `POST /api/posts/{slug}/comments`
- `isAuthor` and the forced display name apply to the owner only. Contributors post like visitors
  (name required).

## Public posts

### 🔓 `GET /api/posts`, `GET /api/posts/{slug}` (additive)
- Feed items gain `authorName`. Post detail `author.displayName` is the post's writer (was always the
  site owner). Still `Published` only.
