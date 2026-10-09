# Research: Sign in with Google

## R1. Library

- **Decision**: `Microsoft.AspNetCore.Authentication.Google` 9.0.x, the same handler OAuth2.0Learn uses
  (there on 9.0). It handles authorization-code flow, `state`, PKCE, the correlation cookie and the
  server-side code exchange.
- **Rationale**: First-party, and it plugs straight into Identity's external-login support. Principle V
  forbids custom token schemes.
- **Alternatives**: Google Identity Services (JS button plus ID-token POST). Rejected because it needs
  Google's script on the page and JWT validation code, and it isn't the flow learned in OAuth2.0Learn.
  Generic OpenID Connect handler: works too, but needs more configuration for the same result.

## R2. Where the link is stored (the "DB change")

- **Decision**: Identity's `AspNetUserLogins` (`LoginProvider = "Google"`, `ProviderKey = sub`,
  `UserId`), via `UserManager.AddLoginAsync` / `FindByLoginAsync`. **No migration.**
- **Rationale**: The table exists since `Initial` and does exactly this job. Its primary key
  `(LoginProvider, ProviderKey)` already ensures one Google account maps to at most one blog account.
  OAuth2.0Learn needed a `GoogleSubject` column only because it has its own user table.
- **Alternatives**: `Author.GoogleSubject` column plus migration. Rejected because it duplicates a
  table that already exists and bypasses `SignInManager.ExternalLoginSignInAsync`. The "linked at"
  timestamp in the spec's first draft was dropped (nothing reads it).

## R3. Redirect URI and same-origin cookie

- **Decision**: Callback path `/api/auth/signin-google`. Under `/api`, so the Vite proxy (dev) and the
  host's `/api/*` rewrite (prod) pass it through, and every cookie (correlation, external, `blog_auth`)
  is set on the blog's own origin, like today's password login.
  - Dev: Vite's proxy keeps the `Host` header (`changeOrigin` is off), so the handler builds
    `http://localhost:5200/api/auth/signin-google`.
  - Prod: the rewrite reaches the backend under its own host name, so when `Site:Url` is set, a small
    middleware before `UseAuthentication` sets `Request.Scheme`/`Host` from `Site:Url` for `/api/auth/*`.
    The handler then builds `https://<blog>/api/auth/signin-google`. `Site:Url` is already a
    required production setting (RSS).
- **Register in Google Cloud Console** (the OAuth2.0Learn client can be reused or a new one created):
  `http://localhost:5200/api/auth/signin-google` and `https://<blog>/api/auth/signin-google`.
- **Alternatives**: Trust `X-Forwarded-Host`. Rejected because it depends on each host's headers and
  would mean changing the shared forwarded-headers setup. Pointing Google at the backend host directly
  was also rejected: cookies would land on the wrong origin.

## R4. Matching the author (no registration)

- **Decision**: After the handler signs in to `IdentityConstants.ExternalScheme`, `GET /api/auth/google/done`:
  1. `GetExternalLoginInfoAsync()`; missing → `failed`.
  2. `FindByLoginAsync("Google", sub)`. If that finds nobody, `email_verified` must be true, then
     `FindByEmailAsync(email)`, which matches regardless of case (it compares normalized emails).
     The found user must have no Google login yet, then `AddLoginAsync`. Anything else → `not-allowed`.
  3. `ExternalLoginSignInAsync("Google", sub, isPersistent: true)` issues `blog_auth` and applies lockout
     (`IsLockedOut` → `locked`).
  4. Always sign out of the external scheme. Redirect to `/admin`, or to `/login?error=<code>`.
- `email_verified` is mapped with `ClaimActions.MapJsonKey("email_verified", "email_verified")`. Its claim
  value is the JSON boolean's text, compared case-insensitively to `"true"`. A missing value fails closed
  (as `GoogleAuthEvents.IsEmailVerified` does in OAuth2.0Learn).
- **Rationale**: Uses Identity's own external-login primitives, so lockout, security stamp and the cookie
  behave exactly like password login (FR-006, FR-009). Fixed redirect targets mean there is no open
  redirect.
- **Alternatives**: Matching in `OnCreatingTicket` like OAuth2.0Learn. Rejected because Identity's
  `done` endpoint pattern needs no custom exceptions or events.

## R5. Errors and cancel

- **Decision**: Error codes `cancelled` (Google `access_denied`, via `OnAccessDenied`), `failed`
  (`OnRemoteFailure`: bad state, expired correlation, exchange error), `not-allowed`, `locked`. Each
  redirects to `/login?error=<code>`. The FE maps codes to fixed text. `not-allowed` never says whether
  the email exists.

## R6. "Not configured" (FR-010)

- **Decision**: `AddGoogle` is registered only when `Authentication:Google:ClientId` and `ClientSecret`
  are both set. `GET /api/auth/providers` → `{ "google": bool }`. The login page hides the button when
  it is false or the call fails. `/api/auth/google` returns `404` when not configured.
- **Alternatives**: A build-time `VITE_` flag. Rejected because it is a second setting that can drift
  from the backend's.

## R7. Testing without Google

- **Decision**: Tests cannot reach Google, so:
  - Challenge: `GET /api/auth/google` (handler configured with dummy ids) → `302` to
    `accounts.google.com` with `state`, `code_challenge` and the expected `redirect_uri`.
  - Callback logic: `BlogApiFactory` adds a test-only endpoint (Testing environment) that signs in to
    `IdentityConstants.ExternalScheme` with chosen `sub` / `email` / `email_verified` claims and the
    `LoginProvider` item. The test then calls `/api/auth/google/done` with that cookie and asserts the
    redirect, the `blog_auth` cookie, `/me`, and the `AspNetUserLogins` / `AspNetUsers` rows.
- Frontend: LoginPage shows or hides the link from `providers`, shows the message for each `?error=`
  code, and passes axe.
