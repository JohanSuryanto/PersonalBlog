# API Contract: Sign in with Google

Extends the [001 contract](../../001-blog-mvp/contracts/api.md) (Auth section). Existing
`POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me` are unchanged. Logout also
clears the session started by Google sign-in.

🔓 = public

### 🔓 `GET /api/auth/providers`
- `200` `{ "google": true }`, where `google` is `false` when no Google credentials are configured.

### 🔓 `GET /api/auth/google`
Browser navigation (not `fetch`). Starts Google sign-in.
- `302` → `https://accounts.google.com/o/oauth2/v2/auth?...` with `response_type=code`, `client_id`,
  `redirect_uri=<public origin>/api/auth/signin-google`, `scope=openid profile email`, `state`,
  `code_challenge` (S256). Sets a short-lived correlation cookie.
- `404` when Google is not configured.

### 🔓 `GET /api/auth/signin-google?code=&state=` (handled by the Google handler)
Google's return address. Validates `state` and the correlation cookie and exchanges the code
server-side, then `302` → `/api/auth/google/done`.
- Cancelled (`error=access_denied`) → `302 /login?error=cancelled`
- Any other failure → `302 /login?error=failed`

### 🔓 `GET /api/auth/google/done`
Decides whether this Google account may sign in (see [research R4](../research.md#r4-matching-the-author-no-registration)).
- Success → sets `blog_auth` (same as password login) → `302 /admin`
- `302 /login?error=not-allowed`: unknown or unverified email, or a different Google account for an
  already-linked author. Never says which.
- `302 /login?error=locked`: the author account is locked out
- `302 /login?error=failed`: no external sign-in in progress

Always clears the temporary external cookie. Never creates an account.

## Login page (`/login`)

| `?error=` | Message (`role="alert"`) |
|---|---|
| `cancelled` | Google sign-in was cancelled. Please try again. |
| `failed` | Google sign-in failed. Please try again. |
| `not-allowed` | This Google account can't sign in here. |
| `locked` | Too many failed attempts. Please wait before trying again. |

The "Continue with Google" link (`href="/api/auth/google"`) is shown only when `providers.google` is `true`.
