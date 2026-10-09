# Research: Post Comments

No open questions came out of the spec, so this is about choosing the simplest way to build
each part with what the project already uses. **No new packages** are needed on either side.

## R1. Rate limiting (FR-008)

- **Decision**: Use ASP.NET Core's built-in rate limiter (`AddRateLimiter` / `RequireRateLimiting`,
  part of the shared framework). A named policy uses a **fixed window** partitioned by
  `HttpContext.Connection.RemoteIpAddress`: 5 permits per 10 minutes, no queue. Rejections return
  `429` with a `Retry-After` header. The limit and window come from config
  (`Comments:RateLimit:PermitLimit`, `Comments:RateLimit:WindowMinutes`) so integration tests can
  raise it, since every test request shares one address.
- **Rationale**: No package, a few lines of setup. Counters are in memory, which is fine for one
  backend instance (constitution: one BE service). Addresses are never stored (spec assumption).
- **Behind a proxy**: the deployed host passes the reader's address in `X-Forwarded-For`. The
  built-in `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` env var turns on forwarded-header handling with
  no code. This is documented in quickstart as a deployment setting.
- **Alternatives considered**: Storing addresses with comments and counting in the database
  (keeps personal data, more code). A Redis-backed limiter (new infrastructure, against the
  constitution). Sliding window (more accurate but no need at this scale).
- ponytail: in-memory counters reset on restart and are per instance; move to a shared store only if
  the API is ever scaled out.

## R2. Honeypot (FR-007)

- **Decision**: The comment request has an optional `website` field. The form renders it as a
  real text input inside a wrapper that is visually hidden, `aria-hidden="true"`, with
  `tabindex="-1"` and `autocomplete="off"`, labelled "Leave this empty". If the server receives a
  non-empty `website`, it returns `201` with a normal-looking comment body but stores nothing.
- **Rationale**: Simple bots fill every field. Returning success hides the trap. Keeping the
  input out of the tab order and the accessibility tree means keyboard and screen-reader users
  never meet it (constitution IV).
- **Alternatives considered**: Captcha (adds friction and a third-party service; rejected in spec);
  time-to-submit checks (more moving parts, easy to tune wrong).

## R3. Plain-text safety (FR-004)

- **Decision**: Store the text exactly as typed (trimmed). React renders it as a text node, which
  escapes it. Line breaks are shown with CSS `white-space: pre-line`. No Markdown, no HTML.
- **Rationale**: Encoding on output is the standard defence (constitution V) and needs no sanitizer
  package.

## R4. Paging comments (FR-013, FR-010)

- **Decision**: Post page: oldest first, 50 per page, keyset on `Id` (`after=<last id>`). Ids come
  from an identity column, so they increase in posting order. Dashboard: newest first, 20 per page,
  `before=<last id>`, loaded by the existing infinite-scroll pattern.
- **Rationale**: Same keyset idea as the feed, but a plain id is enough because `Id` order equals
  time order, so no compound cursor is needed.

## R5. Comment counts (FR-012)

- **Decision**: Compute `commentCount` in the existing feed and detail queries
  (`p.Comments.Count()`, a correlated subquery backed by the `(PostId, Id)` index).
- **Rationale**: At ≤1,000 posts and 10 posts per batch the subquery is cheap. No stored counter
  to keep in sync.
- ponytail: subquery per feed item; add a denormalised `CommentCount` column if the feed gets slow.

## R6. Author comments (FR-014)

- **Decision**: If the request carries a valid author cookie, the server sets `IsAuthor = true` and
  uses the author's display name, ignoring the submitted name. The frontend hides the name field
  for the logged-in author.
- **Rationale**: The badge must be trustworthy, so only the server decides it. A reader can still
  type the author's name, but they will not get the badge.

## R7. Remembering the reader's name (FR-015)

- **Decision**: `localStorage` key `blog.commentName`, wrapped in try/catch (private mode can throw).
- **Rationale**: This is the native browser feature for it. Nothing is sent or stored server-side
  beyond the comment itself.

## R8. CSRF on the new write endpoints

- **Decision**: No extra token. The anonymous `POST` needs no credentials, so forging it gains
  nothing that a direct request would not. The author-only `DELETE` relies on the existing
  `SameSite=Lax` cookie, which browsers do not send on cross-site `DELETE` requests, the same
  protection as the MVP admin endpoints.
