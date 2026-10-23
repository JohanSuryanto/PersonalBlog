# Quickstart & Validation: Personal Blog MVP

How to run the app locally and prove each user story works. Endpoint details live in
[contracts/api.md](contracts/api.md); entities in [data-model.md](data-model.md).

## Prerequisites

- .NET 10 SDK, Node.js 22+, Docker (for local Postgres and Testcontainers)
- A Cloudinary account (cloud name, API key, API secret)
- A Neon project (only for deployed environments; local dev uses Docker Postgres)

## Setup

```powershell
# Local Postgres
docker run -d --name blog-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17

# Backend secrets (never committed — Constitution V)
cd backend/src/Blog.Api
dotnet user-secrets set "ConnectionStrings:Blog" "Host=localhost;Database=blog;Username=postgres;Password=dev"
dotnet user-secrets set "Cloudinary:CloudName" "<cloud>"
dotnet user-secrets set "Cloudinary:ApiKey" "<key>"
dotnet user-secrets set "Cloudinary:ApiSecret" "<secret>"
dotnet user-secrets set "Author:Email" "you@example.com"
dotnet user-secrets set "Author:Password" "<strong password>"
dotnet user-secrets set "Author:DisplayName" "<your name>"

dotnet ef database update      # apply migrations
dotnet run                     # API on http://localhost:5000

# Frontend (separate terminal) — Vite proxies /api to the backend
cd frontend
npm install
npm run dev                    # http://localhost:5200
```

For Neon: use the **pooled** connection string (`...-pooler...`, `SSL Mode=Require`) for the app and
the **direct** string when running `dotnet ef database update`.

## Automated checks (must pass before merge — Constitution III)

```powershell
dotnet test --solution backend/Blog.sln          # integration tests against a real Postgres container
cd frontend; npm test          # Vitest: feed hook, slider, editor limit, axe a11y checks
```

## Manual validation scenarios

### US1 — Author publishes a post with images
1. Go to `/admin` while logged out → redirected to `/login`.
2. Log in with the seeded author. Enter a wrong password 5 times first → expect a lockout message.
3. `/admin/posts/new`: title "Trip", body with a heading and a list, upload 3 images, drag the
   third to first, add alt text to one. Click **Save draft**.
4. In a private window, open `/` and search "Trip" → **not shown** (draft).
5. Click **Publish** → in the private window the post appears at the top of `/`, cover = the
   image you moved first.
6. Try to add images until 11 → the 11th is blocked with "maximum 10 images".
7. Try uploading a `.pdf` or a >10 MB image → rejected with a clear message.
8. **Unpublish** → `/posts/trip` returns "not found" for readers. **Delete** asks for confirmation.

### US2 — Reader browses the feed
1. Seed 30 published posts (e.g., via the editor or a test script).
2. Open `/`, scroll to the bottom repeatedly → posts load 10 at a time, newest first, no
   duplicates, "end of posts" shown after 30.
3. Using only the keyboard, Tab to **Load more** and press Enter → next batch loads.
4. Open a post with 5 images → swipe (touch), click Next/Previous, and use ArrowLeft/ArrowRight;
   counter reads "1 / 5" … "5 / 5"; a screen reader announces the change.
5. Empty database → `/` shows the empty-state message.

### US3 — Search & date filter
1. Search a word appearing in exactly 2 posts → only those 2 shown.
2. Set From/To to one month → only that month's posts. Combine with a keyword → both apply.
3. Reload the page → search and dates are still applied (address contains `?q=&from=&to=`).
4. Set From after To → validation message, no request error.
5. Search `%` or `   ` → no error; `%` matched literally, spaces = no filter.

## Accessibility spot check (Constitution IV)
- Run the browser's Lighthouse/axe on `/`, `/posts/:slug`, `/admin/posts/new` → no WCAG AA violations.
- Navigate the whole publish flow with keyboard only; focus is always visible.
