# Data Model: Personal Blog MVP

PostgreSQL (Neon), managed by EF Core migrations. Identity tables (`AspNetUsers`, etc.) are created
by ASP.NET Core Identity and are not repeated here.

## Author (Identity user)

| Field | Type | Rules |
|---|---|---|
| Id | string (Identity default) | PK |
| Email / UserName | string | Unique; seeded from config |
| DisplayName | string(100) | Required; shown on posts |
| PasswordHash, Lockout fields | Identity-managed | Lockout: 5 failures → 15 min |

Exactly one row in the MVP. No registration endpoint exists.

## Post

| Field | Type | Rules |
|---|---|---|
| Id | int (identity) | PK |
| Title | varchar(200) | Required, trimmed, 1–200 chars (FR-006) |
| Slug | varchar(80), nullable | Unique when set; assigned on first publish, never changed after (FR-010) |
| Body | text | Required, Markdown (FR-006) |
| Excerpt | varchar(200) | Derived on save: body with Markdown stripped, first 200 chars |
| Status | varchar(16) | `Draft` \| `Published` |
| CreatedAt | timestamptz | Set on insert |
| UpdatedAt | timestamptz | Set on every save |
| PublishedAt | timestamptz, nullable | Set when status becomes `Published`; cleared on unpublish (see transitions) |

**Indexes**
- Unique `Slug` (filtered: `Slug IS NOT NULL`).
- `(Status, PublishedAt DESC, Id DESC)` — feed keyset pagination and date filtering.

**Relationships**: Post 1 → 0..10 PostImage (cascade delete).

### State transitions

```text
          create                publish                 unpublish
 (none) ─────────▶ Draft ───────────────▶ Published ───────────────▶ Draft
                     ▲                                                 │
                     └──────────────────── publish ◀───────────────────┘
 any state ── delete (confirmed) ──▶ removed (images destroyed in Cloudinary, best effort)
```

- **Draft → Published**: requires valid Title + Body. Sets `PublishedAt = now`; assigns `Slug` if null.
- **Published → Draft** (unpublish): post leaves feed/search; `GET /api/posts/{slug}` returns 404
  to non-authors. `PublishedAt` cleared, so re-publishing places it at the top as a fresh publish.
- **Edit while Published**: allowed; changes are visible immediately (spec US1-4). Slug unchanged.

## PostImage

| Field | Type | Rules |
|---|---|---|
| Id | int (identity) | PK |
| PostId | int | FK → Post, cascade delete |
| PublicId | varchar(255) | Cloudinary `public_id`; required |
| Position | smallint | 1–10, unique per post; position 1 = cover image (FR-013) |
| AltText | varchar(300), nullable | Author-supplied (FR-014); fallback text generated at render time |
| Width / Height | int | From Cloudinary upload response; used to reserve layout space |
| Format | varchar(10) | One of `jpg`, `png`, `webp`, `gif` (FR-012) |
| Bytes | int | ≤ 10,485,760 (10 MB) (FR-012) |

**Validation on post save** (server-side, authoritative):
- Count ≤ 10 (FR-011) — returns 400 with a clear message otherwise.
- Positions are contiguous 1..n after save (server re-numbers from the submitted order).
- Format and Bytes within limits.
- Images removed by an edit are deleted from the table and from Cloudinary (best effort).

## Derived / query shapes

- **Feed item**: Id, Slug, Title, Excerpt, PublishedAt, Cover (first image: PublicId, Width, Height, AltText).
- **Cursor**: base64(`PublishedAt` ISO-8601 + `|` + `Id`); next page = rows strictly after
  `(PublishedAt, Id)` in `DESC` order.
