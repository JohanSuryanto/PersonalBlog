---

description: "Task list for Sign in with Google"
---

# Tasks: Sign in with Google

**Input**: Design documents from `/specs/003-google-login/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included. Constitution III requires automated tests for authentication on real
PostgreSQL, and IV requires accessibility checks. Write each story's tests first and confirm they
fail before implementing.

**Organization**: Grouped by user story. US1: author signs in with Google. US2: unknown accounts
refused, no account created. US3: password login keeps working.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3 from spec.md

## Path Conventions

- Backend: `backend/src/Blog.Api/`, tests in `backend/tests/Blog.Api.Tests/`
- Frontend: `frontend/src/`, tests colocated as `*.test.tsx`

---

## Phase 1: Setup

- [X] T001 Add `<PackageReference Include="Microsoft.AspNetCore.Authentication.Google" Version="9.0.20" />` (originally 10.0.12; now 9.0.20 after the .NET 9 downgrade; same version as the other ASP.NET packages) to `backend/src/Blog.Api/Blog.Api.csproj` and run `dotnet restore backend`

**No migration**: the Google link uses the existing Identity table `AspNetUserLogins` (data-model.md).

---

## Phase 2: Foundational (blocks all stories)

- [X] T002 In `backend/src/Blog.Api/Program.cs`, register Google only when `Authentication:Google:ClientId` and `Authentication:Google:ClientSecret` are both non-empty (research R6). Chain `.AddGoogle(o => …)` on the existing `AddAuthentication(...)` builder, before `.AddIdentityCookies()` is fine, with:
  - `ClientId` / `ClientSecret` from that config
  - `SignInScheme = IdentityConstants.ExternalScheme`
  - `CallbackPath = "/api/auth/signin-google"`
  - `UsePkce = true` (default; leave it explicit)
  - `SaveTokens = false`
  - `ClaimActions.MapJsonKey("email_verified", "email_verified")`
  - `Events.OnAccessDenied`: `ctx.Response.Redirect("/login?error=cancelled"); ctx.HandleResponse();`
  - `Events.OnRemoteFailure`: log the failure message at Warning, then `ctx.Response.Redirect("/login?error=failed"); ctx.HandleResponse();`
- [X] T003 In `backend/src/Blog.Api/Program.cs`, before `app.UseAuthentication()`, add a middleware (research R3): when `Site:Url` is set and the request path starts with `/api/auth/`, set `ctx.Request.Scheme` and `ctx.Request.Host` from that URL, so Google's `redirect_uri` is `<Site:Url>/api/auth/signin-google`. When `Site:Url` is unset (dev and tests), leave the request as is. Use `// ponytail:` to note that it relies on the host forwarding `/api/*` to this backend.
- [X] T004 [P] In `backend/src/Blog.Api/Endpoints/AuthEndpoints.cs`, add `public record ProvidersResponse(bool Google);` and `auth.MapGet("/providers", ...)`, which returns `new ProvidersResponse(googleConfigured)`. `googleConfigured` is true when `IAuthenticationSchemeProvider.GetSchemeAsync(GoogleDefaults.AuthenticationScheme)` is not null (contracts/api.md).
- [X] T005 [P] Add `providers: () => request<{ google: boolean }>('GET', '/api/auth/providers')` to the `api` object in `frontend/src/api.ts`
- [X] T006 Update `backend/tests/Blog.Api.Tests/BlogApiFactory.cs`:
  - In `ConfigureWebHost`, set `Authentication:Google:ClientId` = `"test-client-id"` and `Authentication:Google:ClientSecret` = `"test-secret"`.
  - Add a test-only `IStartupFilter` (registered in `ConfigureServices`) that serves `GET /test/external-login?sub=&email=&verified=` before the rest of the pipeline. It calls `ctx.SignInAsync(IdentityConstants.ExternalScheme, principal, props)` with:
    - claims `ClaimTypes.NameIdentifier=sub`, `ClaimTypes.Email=email` (when given) and `email_verified=verified`
    - `props.Items["LoginProvider"] = "Google"`

    It returns 204. This fakes Google's return so `/api/auth/google/done` can be tested (research R7).
  - Add `public async Task<HttpClient> GoogleClientAsync(string sub, string? email, bool verified = true)`. It calls that endpoint on a fresh `Client()` and returns the client.
  - In `ResetAsync`, also clear Google links: `TRUNCATE "AspNetUserLogins"` (keep `AspNetUsers`, but delete any user whose email isn't `AuthorEmail`).

**Checkpoint**: Backend builds; `/api/auth/providers` returns `{ "google": true }` in tests.

---

## Phase 3: User Story 1 - Author signs in with Google (P1) 🎯 MVP

**Goal**: The author clicks "Continue with Google", signs in on Google and lands on `/admin` with a normal author session.

**Independent Test**: In tests, fake a Google return for the author's verified email, call `/api/auth/google/done`, and confirm the `302 /admin` redirect, that `/api/auth/me` returns the author, and that one `AspNetUserLogins` row exists.

### Tests (write first, must fail)

- [X] T007 [P] [US1] Create `backend/tests/Blog.Api.Tests/GoogleLoginTests.cs` (`: ApiTest`). Each test uses a client with redirects disabled (`AllowAutoRedirect = false`). Tests:
  - `GET /api/auth/google` → 302 whose `Location` starts with `https://accounts.google.com/o/oauth2/v2/auth` and contains `client_id=test-client-id`, `state=`, `code_challenge=`, `code_challenge_method=S256` and `redirect_uri=https%3A%2F%2Flocalhost%2Fapi%2Fauth%2Fsignin-google`.
  - `GoogleClientAsync("sub-1", AuthorEmail)` then `GET /api/auth/google/done` → 302 `Location: /admin`. `GET /api/auth/me` → 200 with the author's email. The DB has exactly one `UserLogins` row (`LoginProvider="Google"`, `ProviderKey="sub-1"`, `UserId` = the author).
  - Email matches regardless of case: `"AUTHOR@example.com"` signs in.
  - After linking `sub-1`, a sign-in with `sub-1` and a *different* email (`"changed@example.com"`) still succeeds (US1-5).
  - After a Google sign-in, `POST /api/auth/logout` → 204 and `/api/auth/me` → 401.
  - Author-only endpoint works: `GET /api/admin/posts` → 200 after a Google sign-in.
- [X] T008 [P] [US1] In `frontend/src/pages/LoginPage.test.tsx`:
  - Stub `/api/auth/providers` (default `{ google: true }`).
  - Test that a link named "Continue with Google" with `href="/api/auth/google"` is shown.
  - Test that it is absent when providers returns `{ google: false }` or fails (500).
  - Test that the page still has no axe violations with the link shown.

### Implementation

- [X] T009 [US1] In `backend/src/Blog.Api/Endpoints/AuthEndpoints.cs`, add `auth.MapGet("/google", ...)`:
  - If the Google scheme isn't registered (same check as T004), return `Results.NotFound()`.
  - Otherwise return `Results.Challenge(new AuthenticationProperties { RedirectUri = "/api/auth/google/done", Items = { ["LoginProvider"] = "Google" } }, [GoogleDefaults.AuthenticationScheme])`. Fixed RedirectUri, so no open redirect.
- [X] T010 [US1] In `backend/src/Blog.Api/Endpoints/AuthEndpoints.cs`, add `auth.MapGet("/google/done", ...)` (research R4, happy path). It takes `HttpContext`, `SignInManager<Author>` and `UserManager<Author>`:
  1. `var info = await signIn.GetExternalLoginInfoAsync()`. If null → `Results.Redirect("/login?error=failed")`.
  2. `var user = await users.FindByLoginAsync("Google", info.ProviderKey)`.
  3. If null: read email `info.Principal.FindFirstValue(ClaimTypes.Email)` and `email_verified`, and `FindByEmailAsync(email)`. If found, `AddLoginAsync(user, new UserLoginInfo("Google", info.ProviderKey, "Google"))`.
  4. `var result = await signIn.ExternalLoginSignInAsync("Google", info.ProviderKey, isPersistent: true)`. If `Succeeded` → `Results.Redirect("/admin")`.
  5. Always (use `try/finally`) call `await ctx.SignOutAsync(IdentityConstants.ExternalScheme)`.
- [X] T011 [US1] In `frontend/src/pages/LoginPage.tsx`:
  - On mount, call `api.providers()` into `const [google, setGoogle] = useState(false)`. On failure, keep it false.
  - When `google` is true, render the following after the password `<form>` and before the back link:
    - a divider `<p className="login-divider"><span>or</span></p>`
    - `<a className="google-login" href="/api/auth/google">` containing a decorative inline Google "G" SVG (`aria-hidden="true"`) and the text "Continue with Google". It must be a full-page navigation, not React Router `<Link>`.
- [X] T012 [P] [US1] In `frontend/src/index.css`, style `.login-divider` (a centered "or" with lines on both sides, using existing color tokens) and `.google-login`:
  - full width, same height and radius as `.login-submit`, neutral background with a 1px border
  - visible `:focus-visible` outline consistent with existing buttons
  - correct in dark mode via existing tokens

**Checkpoint**: US1 tests pass. Manually: quickstart.md rows 1–3.

---

## Phase 4: User Story 2 - Unknown Google accounts are refused, no account is created (P1)

**Goal**: Only the existing author can sign in with Google. Everyone else is turned away with a clear message, and no account is ever created.

**Independent Test**: Fake a Google return with a stranger's email. `/api/auth/google/done` redirects to `/login?error=not-allowed`, `/me` is 401, and `AspNetUsers` and `AspNetUserLogins` row counts are unchanged.

### Tests (write first, must fail)

- [X] T013 [P] [US2] Add to `backend/tests/Blog.Api.Tests/GoogleLoginTests.cs`. Unless noted, each expects `302 Location: /login?error=not-allowed`, `/api/auth/me` → 401, and `AspNetUsers` count still 1:
  - Unknown email (`"stranger@example.com"`) → refused; zero `UserLogins` rows.
  - Author email with `verified=false` → refused; zero `UserLogins` rows.
  - Author email with no `email_verified` claim at all → refused (fails closed).
  - After `sub-1` is linked, `sub-2` with the author's email → refused; still exactly one `UserLogins` row (`sub-1`).
  - Author locked out (set `LockoutEnd` to now + 15 min via `WithDbAsync`), then Google sign-in with linked `sub-1` → `302 /login?error=locked`.
  - `GET /api/auth/google/done` with no external cookie → `302 /login?error=failed`.
  - Not configured: `Factory.WithWebHostBuilder(b => b.UseSetting("Authentication:Google:ClientId", ""))` → `/api/auth/providers` returns `{ "google": false }` and `GET /api/auth/google` → 404.
- [X] T014 [P] [US2] In `frontend/src/pages/LoginPage.test.tsx`, test that rendering `/login?error=<code>` shows the `role="alert"` message from contracts/api.md for each code:
  - `cancelled`: "Google sign-in was cancelled. Please try again."
  - `failed`: "Google sign-in failed. Please try again."
  - `not-allowed`: "This Google account can't sign in here."
  - `locked`: "Too many failed attempts. Please wait before trying again."
  - an unknown code shows no alert

### Implementation

- [X] T015 [US2] Harden `/google/done` in `backend/src/Blog.Api/Endpoints/AuthEndpoints.cs` (research R4):
  - **Email match only when verified**: only try `FindByEmailAsync` when the email is non-empty AND `string.Equals(info.Principal.FindFirstValue("email_verified"), "true", StringComparison.OrdinalIgnoreCase)`.
  - **One Google account per author**: before `AddLoginAsync`, refuse when `(await users.GetLoginsAsync(user)).Any(l => l.LoginProvider == "Google")`.
  - **Never create users**: no `CreateAsync` call anywhere.
  - **Refusals**: no user found, or the user already has a different Google link → `Results.Redirect("/login?error=not-allowed")`.
  - **Lockout**: `result.IsLockedOut` → `Results.Redirect("/login?error=locked")`. Any other failed result → `/login?error=not-allowed`.
  - **Logging**: log each refusal at Information with a reason code only (no email).
- [X] T016 [US2] In `frontend/src/pages/LoginPage.tsx`, read `error` with `useSearchParams()`. Map the four codes to the messages in contracts/api.md and show the result in the existing `<p id="login-error" role="alert" className="alert">`. The local `error` state from a password attempt takes precedence. Clear the query param (`setSearchParams({}, { replace: true })`) when the password form is submitted.

**Checkpoint**: US1 + US2 tests pass. Manually: quickstart.md rows 4–5, 7.

---

## Phase 5: User Story 3 - Password login keeps working (P2)

**Goal**: Linking Google doesn't affect email and password login.

**Independent Test**: Link Google, log out, and log in with email and password.

- [X] T017 [US3] Add to `backend/tests/Blog.Api.Tests/GoogleLoginTests.cs`: after a Google sign-in links `sub-1` and the session is logged out, `POST /api/auth/login` with `AuthorEmail` / `AuthorPassword` → 200, and `/me` → 200. Also run the existing `AuthTests.cs` unchanged; it must stay green.

**Checkpoint**: All backend tests pass. Manually: quickstart.md row 6.

---

## Phase 6: Polish & Cross-Cutting

- [X] T018 [P] In `README.md`, add two rows to the Secrets table: `Authentication:Google:ClientId` / `Authentication:Google:ClientSecret` (env `Authentication__Google__ClientId` …; optional, the Google button is hidden without them). Add a Deployment bullet: register `https://<blog>/api/auth/signin-google` (and `http://localhost:5200/api/auth/signin-google` for dev) as authorized redirect URIs in Google Cloud Console, and set `Site__Url`. Link `specs/003-google-login/`.
- [X] T019 [P] In `specs/001-blog-mvp/contracts/api.md`, add a note under the Auth section that it is extended by [003-google-login](../../003-google-login/contracts/api.md) (`/providers`, `/google`, `/signin-google`, `/google/done`).
- [X] T020 Run `dotnet test backend` (Docker) and `cd frontend; npm test; npm run build`. All must pass.
- [X] T021 Run quickstart.md validation rows 1–7 against a real Google client (needs your Google client ID and secret in user-secrets). Done 2026-10-23: rows 1–4, 6, 7 pass. Row 5 skipped because Google's account chooser has no Cancel button; checked instead by sending Google's access_denied callback with a real state cookie, which redirects to /login?error=cancelled.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T006)** → user stories.
- **US1 (T007–T012)** → **US2 (T013–T016)**: T015 extends the endpoint written in T010; T016 extends T011.
- **US3 (T017)**: needs the US1 happy path. Independent of US2.
- **Polish (T018–T021)**: after all stories. T018 and T019 can run any time.

Within a story: tests first (must fail), then backend, then frontend.

## Parallel Opportunities

- Phase 2: T004 and T005 run together, both alongside T006. T002 and T003 touch the same file (`Program.cs`), so run them in sequence.
- US1: T007 (backend tests) ∥ T008 (frontend tests). Then T009 → T010 (same file) ∥ T011 → T012.
- US2: T013 ∥ T014. Then T015 ∥ T016.
- Polish: T018 ∥ T019.

```text
# US1 example
Agent A: T007 → T009 → T010   (backend)
Agent B: T008 → T011 → T012   (frontend)
```

## Implementation Strategy

- **MVP = US1 + US2**. Both are P1. Do not ship US1 alone: without US2's checks, the email match isn't
  restricted to verified emails or one Google link per author.
- Then US3 (a regression guard; it should pass immediately), then Polish.
- No migration and no data backfill. Rolling back means removing the Google secrets, which hides the
  button; existing `AspNetUserLogins` rows are harmless.
