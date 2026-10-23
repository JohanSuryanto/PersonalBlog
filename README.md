# Personal Blog

React (Vite) frontend + ASP.NET Core (.NET 10) API, PostgreSQL (Neon) and Cloudinary for images.

- Spec, plan and tasks: [`specs/001-blog-mvp/`](specs/001-blog-mvp/)
- Run & validate locally: [`specs/001-blog-mvp/quickstart.md`](specs/001-blog-mvp/quickstart.md)
- API contract: [`specs/001-blog-mvp/contracts/api.md`](specs/001-blog-mvp/contracts/api.md)

## Run locally

Needs .NET 10 SDK, Node.js 22+ and Docker Desktop (running).

```powershell
# 1. Database (first time only: create; afterwards just start it)
docker run -d --name blog-pg -e POSTGRES_PASSWORD=dev -p 5433:5432 postgres:17
docker start blog-pg

# 2. Backend secrets (first time only), from backend/src/Blog.Api
dotnet user-secrets set "ConnectionStrings:Blog" "Host=localhost;Port=5433;Database=blog;Username=postgres;Password=dev"
dotnet user-secrets set "Author:Email" "you@example.com"
dotnet user-secrets set "Author:Password" "<strong password>"
dotnet user-secrets set "Author:DisplayName" "<your name>"
dotnet ef database update      # apply migrations (also after pulling new ones)

# 3. Backend → http://localhost:5000
cd backend; .\run

# 4. Frontend (second terminal) → http://localhost:5200, proxies /api to :5000
cd frontend; npm install; npm run dev
```

Open http://localhost:5200 (log in at `/login`). Image uploads also need the Cloudinary keys below.

## Secrets

Never commit secrets. Locally use `dotnet user-secrets` (in `backend/src/Blog.Api`); in deployment use env vars:

| Key (user-secrets) | Env var | Notes |
|---|---|---|
| `ConnectionStrings:Blog` | `ConnectionStrings__Blog` | Neon **pooled** string (`-pooler` host, `SSL Mode=Require`) |
| `Cloudinary:CloudName` / `ApiKey` / `ApiSecret` | `Cloudinary__CloudName` … | From the Cloudinary dashboard |
| `Author:Email` / `Password` / `DisplayName` | `Author__Email` … | Creates the owner account on first start and gives it the `Owner` role on every start |
| `Authentication:Google:ClientId` / `ClientSecret` | `Authentication__Google__ClientId` … | Optional. Enables "Continue with Google" ([spec](specs/003-google-login/)); hidden without them |
| `Contributors:SignupEnabled` | `Contributors__SignupEnabled` | Default `true`. `false` stops new writers signing up; existing writers and the owner still sign in |
| `Images:ContributorUploadsPerDay` | `Images__ContributorUploadsPerDay` | Default `30`. Image uploads per writer per day (the owner is not limited) |

Frontend: set `VITE_CLOUDINARY_CLOUD_NAME` (build-time) in `frontend/.env.local` or the host's env settings.

## Migrations on Neon

Run migrations with the **direct** (non-pooled) connection string — PgBouncer in the pooled endpoint
does not support everything migrations need:

```powershell
cd backend/src/Blog.Api
dotnet ef database update --connection "Host=ep-xxx.region.aws.neon.tech;Database=blog;Username=...;Password=...;SSL Mode=Require"
```

## Deployment

- Backend: `backend/src/Blog.Api/Dockerfile` → any container host.
- **Sign in with Google** (optional): in Google Cloud Console add `https://<your blog>/api/auth/signin-google` (and
  `http://localhost:5200/api/auth/signin-google` for local dev) as authorized redirect URIs, and set `Site__Url`
  so the backend tells Google the public address. The owner's Google account (verified email equal to
  `Author:Email`) is linked on first use in `AspNetUserLogins`. Any other verified Google account becomes a
  **contributor** ([spec](specs/004-contributor-posts/)): their posts wait for the owner's approval, at most 2 at a
  time, and they can't moderate comments. After deploying spec 004, the owner signs out and back in once to pick up
  the `Owner` role.
- Frontend: `npm run build` in `frontend/` → static host. It must rewrite `/api/*` to the backend so the
  login cookie stays same-origin (`frontend/vercel.json` points at `johans-journal-api.onrender.com`; change it if the backend moves).
- The blog name lives in `frontend/src/site.ts`, `frontend/index.html` and the backend `Site:Name` setting.
- Set `Site__Url` (e.g. `https://myblog.example`) on the backend so the RSS feed (`/api/rss.xml`) links to the
  public site rather than the backend host.
- **Link previews** (WhatsApp, Slack, X, Facebook, LinkedIn…): their crawlers don't run JavaScript, so the
  frontend host must send crawler requests for `/posts/{slug}` and `/?post={slug}` to the backend's
  `/api/preview/posts/{slug}`, which returns Open Graph tags with a 1200×630 cover from Cloudinary.
  `frontend/vercel.json` does this by user-agent; on other hosts add the same rule (keep the crawler list in
  sync with `frontend/vite.config.ts`, which does the same locally). Needs `Site__Url` and
  `Cloudinary__CloudName` on the backend. Check a live link with a preview debugger such as opengraph.xyz.
  Locally: `curl -A WhatsApp http://localhost:5200/posts/<slug>`.
- Set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` on the backend when it runs behind a proxy, so the comment
  rate limit (5 per 10 minutes, `Comments:RateLimit`) counts each reader's address, not the proxy's.

## Tests

```powershell
dotnet test --solution backend/Blog.sln   # needs Docker running (real Postgres via Testcontainers)
cd frontend; npm test
```
