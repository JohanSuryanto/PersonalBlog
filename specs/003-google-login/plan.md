# Implementation Plan: Sign in with Google

**Branch**: `003-google-login` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-google-login/spec.md`

## Summary

The existing author can sign in with Google as well as with email and password. The backend adds
ASP.NET Core's Google handler (the same one OAuth2.0Learn uses) on top of the existing ASP.NET Core
Identity setup. The browser goes to Google and back through the existing same-origin `/api/*` proxy.
Identity's external-login flow then looks up the author by the Google ID or, on first use, by
verified email, and issues the usual `blog_auth` session cookie. Nothing creates an account.

**DB changes: none.** The Google link goes in Identity's `AspNetUserLogins` table, which the
`Initial` migration already created and which is still empty. No new migration is needed.

New: one package, three endpoints, a "Continue with Google" link on the login page.
Details: [research.md](research.md).

## Technical Context

**Language/Version**: C# / .NET 9 backend (downgraded from 10 so Visual Studio 2022 17.12 can open it); TypeScript 5 + React 19 frontend (unchanged)

**Primary Dependencies**: + `Microsoft.AspNetCore.Authentication.Google` 9.0.x (first-party, matches
the other 9.0.x ASP.NET packages). Everything else is already installed (Identity, EF Core, Npgsql).

**Storage**: PostgreSQL, existing `AspNetUserLogins` table; no schema change

**Testing**: xUnit + WebApplicationFactory + Testcontainers Postgres; Vitest + Testing Library + axe

**Target Platform**: Unchanged (Linux container API, static SPA behind a `/api/*` rewrite)

**Project Type**: Web application (frontend + backend API)

**Performance Goals**: Login page to dashboard in under 15 s when already signed in to Google (SC-001).
Only one extra request (code exchange plus profile) per sign-in.

**Constraints**: Same-origin session cookie; Google secrets server-side only; fails closed on an
unverified email; works without Google configured (FR-010)

**Scale/Scope**: One author account; 1 package, 3 endpoints, 1 page change, 0 migrations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Simplicity First | One new package, first-party and justified: hand-writing OAuth state/PKCE/code exchange is exactly what Principle V forbids. Reuses Identity's built-in external-login store and `SignInManager`; no new tables, services or abstractions. | ✅ Pass |
| II. API-First Separation | New endpoints in [contracts/api.md](contracts/api.md) and OpenAPI. All rules (allowed account, verified email, one link, lockout) are enforced in the BE; the FE only renders a link and a message. Additive only. | ✅ Pass |
| III. Tested Publishing Flow | Auth integration tests on real Postgres: challenge redirect (state + PKCE), first-use link by verified email, unknown/unverified/second Google account refused with no account created, lookup by Google ID after email change, lockout, providers flag on/off, password login unchanged. | ✅ Pass |
| IV. Accessible by Default | The Google option is a real link with visible focus; refusal messages use the existing `role="alert"` pattern; axe test on the login page. | ✅ Pass |
| V. Secure Authentication | ASP.NET Core Identity external logins plus Microsoft's Google handler (state, PKCE, correlation cookie). Client secret only in user-secrets or env vars. No registration path. Fixed redirect targets, so no open redirect. | ✅ Pass |
| Tech Constraints | Same two deployables. No schema change, so no migration is needed. | ✅ Pass |

**Post-design re-check (after Phase 1)**: ✅ Pass, no exceptions. Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-google-login/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (changes only)

```text
backend/src/Blog.Api/
├── Blog.Api.csproj               # + Microsoft.AspNetCore.Authentication.Google
├── Program.cs                    # + AddGoogle(...) only when ClientId is set; public-origin fix for /api/auth (R3)
└── Endpoints/AuthEndpoints.cs    # + GET /google, GET /google/done, GET /providers
backend/tests/Blog.Api.Tests/
├── BlogApiFactory.cs             # + test helper that fakes the external (Google) sign-in
└── GoogleLoginTests.cs           # new

frontend/src/
├── api.ts                        # + providers()
├── pages/LoginPage.tsx           # + "Continue with Google" link, ?error= messages (+ LoginPage.test.tsx)
└── index.css                     # + Google button style

README.md                         # + Authentication:Google secrets, redirect URIs
```

**Structure Decision**: Same two-deployable layout. The Google endpoints belong in the existing
`AuthEndpoints.cs`, and the account-matching logic stays inline in the callback (one caller, so no
separate service).

## Complexity Tracking

Not needed: no constitution violations.
