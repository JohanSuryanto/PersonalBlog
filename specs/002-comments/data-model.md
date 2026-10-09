# Data Model: Post Comments

## Comment (new table `Comments`)

| Field | Type | Rules |
|---|---|---|
| Id | int, identity PK | Increasing in posting order (used as paging key) |
| PostId | int, FK → Posts.Id | Required; **ON DELETE CASCADE** (FR-011) |
| Name | varchar(50) | Required, trimmed, 1–50 chars; author's display name when `IsAuthor` |
| Body | varchar(2000) | Required, trimmed, 1–2,000 chars, plain text, line breaks kept |
| IsAuthor | bool | Set by the server only, true when posted with a valid author session |
| CreatedAt | timestamptz | Set by the server (UTC) |

**Indexes**
- `(PostId, Id)`: post page paging and comment counts.
- The PK on `Id` covers the dashboard's newest-first list.

**Relationships**
- `Post 1 ── * Comment`: a navigation `Post.Comments` is added. Deleting a post removes its comments.

**Visibility rules**
- Comments are readable and creatable only while their post is `Published` (FR-005).
  Unpublishing hides them but keeps them, and republishing shows them again.
- The dashboard list shows comments on all posts, including drafts, because the author owns them all.

**Not stored**: the sender's address (rate limiting is in memory only), the honeypot field, and
any edit history (readers cannot edit).

**Migration**: `AddComments` (EF Core), which creates the table, FK and index.
