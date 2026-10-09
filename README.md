# Personal Blog

React (Vite) frontend + ASP.NET Core (.NET 10) API, PostgreSQL (Neon) and Cloudinary for images.

- Spec, plan and tasks: [`specs/001-blog-mvp/`](specs/001-blog-mvp/)
- Run & validate locally: [`specs/001-blog-mvp/quickstart.md`](specs/001-blog-mvp/quickstart.md)
- API contract: [`specs/001-blog-mvp/contracts/api.md`](specs/001-blog-mvp/contracts/api.md)

## Secrets

Never commit secrets. Locally use `dotnet user-secrets` (in `backend/src/Blog.Api`); in deployment use env vars:

| Key (user-secrets) | Env var | Notes |
|---|---|---|
| `ConnectionStrings:Blog` | `ConnectionStrings__Blog` | Neon **pooled** string (`-pooler` host, `SSL Mode=Require`) |
| `Cloudinary:CloudName` / `ApiKey` / `ApiSecret` | `Cloudinary__CloudName` … | From the Cloudinary dashboard |
| `Author:Email` / `Password` / `DisplayName` | `Author__Email` … | Creates the single author account on first start |

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
- Frontend: `npm run build` in `frontend/` → static host. It must rewrite `/api/*` to the backend so the
  login cookie stays same-origin (`frontend/vercel.json` is an example; replace `YOUR-BACKEND-HOST`).
- Set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` on the backend when it runs behind a proxy, so the comment
  rate limit (5 per 10 minutes, `Comments:RateLimit`) counts each reader's address, not the proxy's.

## Tests

```powershell
dotnet test backend      # needs Docker running (real Postgres via Testcontainers)
cd frontend; npm test
```
