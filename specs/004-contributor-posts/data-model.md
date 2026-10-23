# Data Model: Contributor Posts with Owner Approval

## Author (existing, `AspNetUsers`)

No column changes. The role decides powers (research R1):

- **Owner**: in the `Owner` role (exactly one, the seeded `Author:Email` account).
- **Contributor**: any other account, created by Google sign-in (R2). No password.

## Post (changed)

| Field | Change | Notes |
|-------|--------|-------|
| `AuthorId` | **new**, string, required, FK → `AspNetUsers.Id`, Restrict | Writer. Migration backfills existing rows with the single existing user. Indexed. |
| `Status` | values extended | `Draft`, `Published`, **`Pending`**, **`Rejected`**. Stored as string (max 16), so the enum change needs no schema change. |
| `PendingSlot` | **new**, smallint?, 1 or 2 | Non-null only while `Status = Pending`. Unique `(AuthorId, PendingSlot)` where not null enforces the cap (R3). |
| `ReviewNote` | **new**, string?, max 500 | Set on reject; cleared on resubmit or approve. Visible only to the writer and the owner. |

### Rules

- Contributor create or update → `Status = Pending`, takes a free slot (keeps its slot if already
  Pending). No free slot → 409.
- Contributor may update or delete only their own posts in `Pending` or `Rejected`. `Published` → 403.
- Owner approve: `Pending` → `Published` (sets `PublishedAt`, assigns `Slug` as today), clears
  `PendingSlot` and `ReviewNote`.
- Owner reject: `Pending` → `Rejected`, clears `PendingSlot`, sets `ReviewNote`.
- Owner's own posts: `Draft` ↔ `Published` as today. Owner posts never use Pending.
- `PendingSlot` is null whenever `Status != Pending` (set in the one save path).
- Readers and public endpoints still see `Published` only (unchanged filters).

### State transitions (contributor posts)

```text
(new) --submit--> Pending --approve(owner)--> Published --(owner: unpublish/edit/delete as today)
                     |  ^
         reject(owner)|  |resubmit (contributor edit, needs a free slot)
                     v  |
                   Rejected
Pending/Rejected --delete(contributor or owner)--> (gone, slot freed)
```

## Migration `ContributorPosts`

1. Add `AuthorId` as nullable, then `UPDATE "Posts" SET "AuthorId" = (SELECT "Id" FROM "AspNetUsers" LIMIT 1)`,
   then make it non-null and add the FK and index. Runs while the owner is the only user.
2. Add `PendingSlot`, `ReviewNote`, and the filtered unique index.
