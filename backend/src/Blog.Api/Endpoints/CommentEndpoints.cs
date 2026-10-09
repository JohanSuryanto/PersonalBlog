using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Endpoints;

public record CommentDto(int Id, string Name, string Body, bool IsAuthor, DateTimeOffset CreatedAt);
public record CommentInput(string? Name, string? Body, string? Website);
public record CommentPage<T>(List<T> Items, bool HasMore);
public record AdminCommentPost(int Id, string? Slug, string Title, string Status, string? CoverPublicId);
public record AdminCommentPage(List<AdminComment> Items, bool HasMore, int Total, int LastWeek);
public record AdminComment(int Id, string Name, string Body, bool IsAuthor, DateTimeOffset CreatedAt, AdminCommentPost Post);

public static class CommentEndpoints
{
    public const string RateLimitPolicy = "comments";
    const int PageSize = 50;
    const int AdminPageSize = 20;

    public static void MapCommentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/posts/{slug}/comments", async (string slug, int? after, BlogDbContext db) =>
        {
            var postId = await PublishedPostIdAsync(slug, db);
            if (postId is null) return Results.NotFound();

            var rows = await db.Comments.AsNoTracking()
                .Where(c => c.PostId == postId && c.Id > (after ?? 0))
                .OrderBy(c => c.Id)
                .Take(PageSize + 1)
                .Select(c => new CommentDto(c.Id, c.Name, c.Body, c.IsAuthor, c.CreatedAt))
                .ToListAsync();
            return Results.Ok(new CommentPage<CommentDto>(rows.Take(PageSize).ToList(), rows.Count > PageSize));
        });

        app.MapPost("/api/posts/{slug}/comments", async (string slug, CommentInput input, HttpContext http, BlogDbContext db) =>
        {
            var postId = await PublishedPostIdAsync(slug, db);
            if (postId is null) return Results.NotFound();

            var isAuthor = http.User.Identity?.IsAuthenticated == true;
            var name = isAuthor
                ? await db.Users.Select(u => u.DisplayName).FirstAsync()
                : input.Name?.Trim() ?? "";
            var body = input.Body?.Trim() ?? "";

            var errors = new Dictionary<string, string[]>();
            if (name.Length == 0) errors["Name"] = ["Name is required."];
            else if (name.Length > Comment.MaxNameLength) errors["Name"] = [$"Name must be {Comment.MaxNameLength} characters or fewer."];
            if (body.Length == 0) errors["Body"] = ["Comment is required."];
            else if (body.Length > Comment.MaxBodyLength) errors["Body"] = [$"Comment must be {Comment.MaxBodyLength} characters or fewer."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var location = $"/api/posts/{slug}/comments";
            // Honeypot: bots fill every field. Look successful so they don't adapt, but store nothing.
            if (!string.IsNullOrEmpty(input.Website))
                return Results.Created(location, new CommentDto(0, name, body, false, DateTimeOffset.UtcNow));

            var comment = new Comment { PostId = postId.Value, Name = name, Body = body, IsAuthor = isAuthor, CreatedAt = DateTimeOffset.UtcNow };
            db.Comments.Add(comment);
            await db.SaveChangesAsync();
            return Results.Created(location, new CommentDto(comment.Id, comment.Name, comment.Body, comment.IsAuthor, comment.CreatedAt));
        }).RequireRateLimiting(RateLimitPolicy);

        var admin = app.MapGroup("/api/admin/comments").RequireAuthorization();

        admin.MapGet("/", async (int? before, BlogDbContext db) =>
        {
            var rows = await db.Comments.AsNoTracking()
                .Join(db.Posts, c => c.PostId, p => p.Id, (c, p) => new { c, p })
                .Where(x => before == null || x.c.Id < before)
                .OrderByDescending(x => x.c.Id)
                .Take(AdminPageSize + 1)
                .Select(x => new AdminComment(x.c.Id, x.c.Name, x.c.Body, x.c.IsAuthor, x.c.CreatedAt,
                    new AdminCommentPost(x.p.Id, x.p.Slug, x.p.Title, x.p.Status.ToString(),
                        x.p.Images.OrderBy(i => i.Position).Select(i => i.PublicId).FirstOrDefault())))
                .ToListAsync();
            var weekAgo = DateTimeOffset.UtcNow.AddDays(-7);
            return new AdminCommentPage(rows.Take(AdminPageSize).ToList(), rows.Count > AdminPageSize,
                await db.Comments.CountAsync(), await db.Comments.CountAsync(c => c.CreatedAt >= weekAgo));
        });

        admin.MapDelete("/{id:int}", async (int id, BlogDbContext db) =>
            await db.Comments.Where(c => c.Id == id).ExecuteDeleteAsync() > 0 ? Results.NoContent() : Results.NotFound());
    }

    static Task<int?> PublishedPostIdAsync(string slug, BlogDbContext db) =>
        db.Posts.Where(p => p.Slug == slug && p.Status == PostStatus.Published).Select(p => (int?)p.Id).FirstOrDefaultAsync();
}
