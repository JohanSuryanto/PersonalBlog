# Quickstart: Sign in with Google

## Setup

1. Google Cloud Console → Credentials → OAuth client (Web). You can reuse the OAuth2.0Learn client.
   Add the authorized redirect URIs:
   - `http://localhost:5200/api/auth/signin-google`
   - `https://<your blog domain>/api/auth/signin-google` (production)
2. Secrets (in `backend/src/Blog.Api`):
   ```powershell
   dotnet user-secrets set "Authentication:Google:ClientId" "<id>.apps.googleusercontent.com"
   dotnet user-secrets set "Authentication:Google:ClientSecret" "<secret>"
   ```
   Production env vars: `Authentication__Google__ClientId`, `Authentication__Google__ClientSecret`, and
   `Site__Url` (already required).
3. Make sure `Author:Email` is the email of the Google account you'll use.
4. No migration to run.

## Run

```powershell
cd backend/src/Blog.Api; dotnet run      # http://localhost:5000
cd frontend; npm run dev                 # http://localhost:5200
```

## Validate

| # | Do | Expect |
|---|---|---|
| 1 | Open `http://localhost:5200/login` | "Continue with Google" shown next to the password form |
| 2 | Click it, sign in with the author's Google account | Back on `/admin`, signed in. One `Google` row in `AspNetUserLogins` |
| 3 | Log out, sign in with Google again | Signed in (matched by Google ID) |
| 4 | Log out, sign in with another Google account | `/login` shows "This Google account can't sign in here." No new rows in `AspNetUsers` or `AspNetUserLogins` |
| 5 | Click Google, then Cancel on Google's screen | `/login` shows "Google sign-in was cancelled." |
| 6 | Log in with email and password | Works as before |
| 7 | Remove the Google secrets, restart the API | Button hidden, password login works |

Check the DB: `SELECT "LoginProvider", "ProviderKey", "UserId" FROM "AspNetUserLogins";`

## Tests

```powershell
dotnet test backend      # GoogleLoginTests (Docker required)
cd frontend; npm test    # LoginPage.test.tsx
```
