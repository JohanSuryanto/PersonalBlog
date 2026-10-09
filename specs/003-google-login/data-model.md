# Data Model: Sign in with Google

**No schema change and no migration.** Extends [001 data model](../001-blog-mvp/data-model.md).

## Google link → `AspNetUserLogins` (existing Identity table, created by `Initial`)

| Column | Value for Google | Rules |
|---|---|---|
| LoginProvider | `"Google"` | PK part 1 |
| ProviderKey | Google `sub` (permanent account ID) | PK part 2. One Google account → at most one blog account |
| ProviderDisplayName | `"Google"` | Informational |
| UserId | Author `Id` | FK → `AspNetUsers`, cascade delete |

- **Created** on the first successful Google sign-in whose verified email matches the author's email
  (case-insensitive), and only if that author has no `"Google"` row yet (spec FR-002, FR-003, FR-005).
- **Read** on every later Google sign-in by `(Google, sub)`; email is no longer used (US1-5).
- **Never created** for unknown or unverified emails; no `AspNetUsers` row is ever created by this
  feature (FR-004).
- **Removed** only by the maintainer (no UI), e.g.
  `DELETE FROM "AspNetUserLogins" WHERE "LoginProvider" = 'Google';`

## Author (`AspNetUsers`)

Unchanged. Lockout fields apply to Google sign-in too (FR-009).
