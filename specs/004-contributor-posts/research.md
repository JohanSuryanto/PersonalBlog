# Research: Contributor Posts with Owner Approval

No open NEEDS CLARIFICATION items; these are the design decisions.

## R1. How the owner is told apart from contributors

- **Decision**: ASP.NET Core Identity roles. Register `AddRoles<IdentityRole>()`; the seeder creates an
  `Owner` role and adds the configured `Author:Email` account to it (idempotent, also fixes the
  existing production account on next start). Owner-only endpoints use `RequireAuthorization(Policies.Owner)`
  (`RequireRole("Owner")`).
- **Rationale**: Built in (constitution I, V). The role tables already exist in the schema because
  `IdentityDbContext<Author>` includes them, so no migration is needed. The role claim goes into the
  login cookie automatically.
- **Alternatives**: `IsOwner` column (needs a custom claims factory or a database lookup on every
  request); comparing the email to configuration in a policy (breaks if the email changes).
- **Note**: The owner's existing cookie gets the role claim when Identity next re-checks the security
  stamp (within 30 min) or at the next sign-in. A one-time re-login after deploy is acceptable.

## R2. Google sign-in creates contributors

- **Decision**: In `/api/auth/google/done`, if there is no link and no account with a matching
  verified email, create an `Author` (UserName = Email = Google email, EmailConfirmed, DisplayName =
  Google `name` claim falling back to the email's local part, no password) and add the Google login.
  Unverified emails are still refused. Linking an existing account by email stays as it is.
  Everyone lands on `/admin`.
- **Rationale**: Spec Q1 = A. This replaces spec 003's "never create" rule (FR-004 there).
- **Alternatives**: Separate registration page (out of scope).

## R3. Enforcing the 2-pending limit under concurrency

- **Decision**: Add a nullable `PendingSlot` (smallint, 1 or 2) to `Post` with a unique index on
  `(AuthorId, PendingSlot)` filtered to `"PendingSlot" IS NOT NULL`. Moving a post into Pending takes a
  free slot number; leaving Pending (approve, reject, delete) clears it. If two requests race for the
  same slot, the unique violation becomes the same 409 "limit reached" response.
- **Rationale**: The database enforces the cap, so no transaction, lock or raw SQL is needed, and it
  works with `EnableRetryOnFailure`.
- **Alternatives**: `SELECT … FOR UPDATE` on the user row inside an explicit transaction (raw SQL, and
  it needs an execution strategy wrapper because retries are enabled); a serializable transaction
  (retry handling).

## R4. One set of post endpoints, scoped by role

- **Decision**: Keep `/api/admin/posts` for everyone signed in. Contributors only see and change
  their own posts, and the server ignores their `status` input: every save becomes Pending. Two new
  owner-only endpoints: `POST /{id}/approve` and `POST /{id}/reject`. The Comments admin group becomes
  owner-only.
- **Rationale**: Reuses the editor, validation and image handling. Business rules stay in the backend
  (constitution II).
- **Alternatives**: A parallel `/api/my/posts` set (duplicates the save and validation logic).

## R5. Image deletion safety

- **Decision**: When a save or delete removes images, only delete a Cloudinary asset if no other
  post still references that `PublicId`.
- **Rationale**: A contributor could otherwise put the owner's image ID in their post and then remove
  it, deleting the owner's image. This is a one-query guard in the shared path.

## R6. Byline and comments

- **Decision**: `Post.AuthorId` (required FK to `AspNetUsers`, `OnDelete: Restrict`). The migration
  backfills existing posts with the single existing user. Post detail and feed items return the
  writer's display name. A comment gets the "Author" badge only for the Owner role. Contributors comment
  like visitors (name field, no badge).
- **Rationale**: FR-013, FR-014; the comment badge must not be granted to contributors (US4 #3).
- **Alternatives**: `SetNull` with an anonymous byline (YAGNI). With Restrict, removing a contributor
  who has posts means the maintainer deletes or reassigns those posts first; nothing is lost silently.

## R7. Slot count shown to contributors

- **Decision**: The frontend counts Pending posts in the contributor's own list (which only contains
  their posts). `/api/auth/me` gains `isOwner`. No separate slots endpoint.
- **Rationale**: The data is already there; the backend is the enforcement point.
