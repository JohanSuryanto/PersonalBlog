using Blog.Api.Data;
using Blog.Api.Models;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Blog.Api.Endpoints;

public record ImageInput(string PublicId, int Width, int Height, string Format, int Bytes, string? AltText);
public record PostInput(string? Title, string? Body, PostStatus Status, List<ImageInput>? Images);
public record AdminPostSummary(int Id, string Title, string? Slug, string Status, DateTimeOffset UpdatedAt, DateTimeOffset? PublishedAt, int ImageCount, string? CoverPublicId,
    string AuthorId, string AuthorName, string? ReviewNote, DateTimeOffset? SubmittedAt);
public record RejectInput(string? Note);

/// Posts for signed-in users. The owner manages every post; contributors only their own, which wait for approval (spec 004).
public static class AdminPostEndpoints
{
    public const string LimitMessage = "You have 2 of 2 posts waiting for approval. Wait for one to be reviewed or delete one.";

    public static void MapAdminPostEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin/posts").RequireAuthorization();

        admin.MapGet("/", (ClaimsPrincipal user, UserManager<Author> users, BlogDbContext db) =>
        {
            var posts = db.Posts.AsNoTracking();
            if (!user.IsInRole(Roles.Owner))
            {
                var userId = users.GetUserId(user);
                posts = posts.Where(p => p.AuthorId == userId);
            }
            return posts
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => new AdminPostSummary(p.Id, p.Title, p.Slug, p.Status.ToString(), p.UpdatedAt, p.PublishedAt, p.Images.Count,
                    p.Images.OrderBy(i => i.Position).Select(i => i.PublicId).FirstOrDefault(),
                    p.AuthorId, db.Users.Where(u => u.Id == p.AuthorId).Select(u => u.DisplayName).FirstOrDefault() ?? "", p.ReviewNote,
                    p.SubmittedAt))
                .ToListAsync();
        });

        // Badge in the site header: how many posts wait for the owner's review.
        admin.MapGet("/pending-count", (BlogDbContext db) => db.Posts.CountAsync(p => p.Status == PostStatus.Pending))
            .RequireAuthorization(Roles.Owner);

        admin.MapGet("/{id:int}", async (int id, ClaimsPrincipal user, UserManager<Author> users, BlogDbContext db) =>
            await db.Posts.Include(p => p.Images).AsNoTracking().FirstOrDefaultAsync(p => p.Id == id) is { } post && CanSee(post, user, users)
                ? Results.Ok(await PostEndpoints.ToDetailAsync(post, db) with
                {
                    CommentCount = await db.Comments.CountAsync(c => c.PostId == id),
                    ReviewNote = post.ReviewNote,
                })
                : Results.NotFound());

        admin.MapPost("/", async (PostInput input, ClaimsPrincipal user, UserManager<Author> users, BlogDbContext db, ImageStore images) =>
        {
            var now = DateTimeOffset.UtcNow;
            var post = new Post { Title = "", Body = "", CreatedAt = now, AuthorId = users.GetUserId(user)! };
            var result = await SaveAsync(post, input, user.IsInRole(Roles.Owner), db, images);
            if (result is not null) return result;
            return Results.Created($"/api/admin/posts/{post.Id}", await PostEndpoints.ToDetailAsync(post, db));
        });

        admin.MapPut("/{id:int}", async (int id, PostInput input, ClaimsPrincipal user, UserManager<Author> users, BlogDbContext db, ImageStore images) =>
        {
            var post = await db.Posts.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (post is null || !CanSee(post, user, users)) return Results.NotFound();
            if (!CanChange(post, user)) return Results.Forbid();
            return await SaveAsync(post, input, user.IsInRole(Roles.Owner), db, images) ?? Results.Ok(await PostEndpoints.ToDetailAsync(post, db));
        });

        admin.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, UserManager<Author> users, BlogDbContext db, ImageStore images) =>
        {
            var post = await db.Posts.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (post is null || !CanSee(post, user, users)) return Results.NotFound();
            if (!CanChange(post, user)) return Results.Forbid();
            var publicIds = post.Images.Select(i => i.PublicId).ToList();
            db.Posts.Remove(post);
            await db.SaveChangesAsync();
            await DeleteUnusedAsync(publicIds, db, images);
            return Results.NoContent();
        });

        admin.MapPost("/{id:int}/approve", async (int id, BlogDbContext db) =>
        {
            var post = await db.Posts.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (post is null) return Results.NotFound();
            if (post.Status != PostStatus.Pending) return Results.Problem(statusCode: 409, title: "Only posts waiting for approval can be approved.");
            var now = DateTimeOffset.UtcNow;
            post.Status = PostStatus.Published;
            post.PublishedAt = now;
            post.Slug ??= await UniqueSlugAsync(post.Title, db);
            post.PendingSlot = null;
            post.ReviewNote = null;
            post.UpdatedAt = now;
            await db.SaveChangesAsync();
            return Results.Ok(await PostEndpoints.ToDetailAsync(post, db));
        }).RequireAuthorization(Roles.Owner);

        admin.MapPost("/{id:int}/reject", async (int id, RejectInput input, BlogDbContext db) =>
        {
            var note = input.Note?.Trim() ?? "";
            if (note.Length > Post.MaxReviewNoteLength)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["Note"] = [$"Note must be {Post.MaxReviewNoteLength} characters or fewer."] });
            var post = await db.Posts.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (post is null) return Results.NotFound();
            if (post.Status != PostStatus.Pending) return Results.Problem(statusCode: 409, title: "Only posts waiting for approval can be rejected.");
            post.Status = PostStatus.Rejected;
            post.PendingSlot = null;
            post.ReviewNote = note.Length == 0 ? null : note;
            post.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(await PostEndpoints.ToDetailAsync(post, db) with { ReviewNote = post.ReviewNote });
        }).RequireAuthorization(Roles.Owner);
    }

    static bool CanSee(Post post, ClaimsPrincipal user, UserManager<Author> users) =>
        user.IsInRole(Roles.Owner) || post.AuthorId == users.GetUserId(user);

    /// Contributors can't change a post once it is published; only the owner can.
    static bool CanChange(Post post, ClaimsPrincipal user) =>
        user.IsInRole(Roles.Owner) || post.Status != PostStatus.Published;

    /// Validates and applies the input. Returns an error result, or null on success.
    static async Task<IResult?> SaveAsync(Post post, PostInput input, bool isOwner, BlogDbContext db, ImageStore imageStore)
    {
        var title = input.Title?.Trim() ?? "";
        var body = input.Body ?? "";
        var images = input.Images ?? [];

        var errors = new Dictionary<string, string[]>();
        if (title.Length == 0) errors["Title"] = ["Title is required."];
        else if (title.Length > 200) errors["Title"] = ["Title must be 200 characters or fewer."];
        if (string.IsNullOrWhiteSpace(body)) errors["Body"] = ["Body is required."];
        if (images.Count > PostImage.MaxPerPost) errors["Images"] = [$"A post can have a maximum {PostImage.MaxPerPost} images."];
        else if (images.Any(i => !PostImage.AllowedFormats.Contains(i.Format?.ToLowerInvariant())))
            errors["Images"] = ["Only JPEG, PNG, WebP or GIF images are allowed."];
        else if (images.Any(i => i.Bytes > PostImage.MaxBytes)) errors["Images"] = ["Images must be 10 MB or smaller."];
        else if (images.Any(i => string.IsNullOrWhiteSpace(i.PublicId))) errors["Images"] = ["Every image needs an uploaded image reference."];
        // The owner may keep a post's review state while editing it, but not move a post into one.
        if (isOwner && input.Status is PostStatus.Pending or PostStatus.Rejected && input.Status != post.Status)
            errors["Status"] = ["Status must be Draft or Published."];
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        // Contributors can only submit for approval; each pending post holds one of their slots.
        var status = isOwner ? input.Status : PostStatus.Pending;
        if (status == PostStatus.Pending && post.PendingSlot is null)
        {
            var used = await db.Posts.Where(p => p.AuthorId == post.AuthorId && p.PendingSlot != null && p.Id != post.Id)
                .Select(p => p.PendingSlot!.Value).ToListAsync();
            var free = Enumerable.Range(1, Post.MaxPendingPerContributor).Select(i => (short)i).Where(i => !used.Contains(i)).ToList();
            if (free.Count == 0) return Results.Problem(statusCode: 409, title: LimitMessage);
            post.PendingSlot = free[0];
            post.SubmittedAt = DateTimeOffset.UtcNow;
        }
        if (!isOwner) post.ReviewNote = null;

        var now = DateTimeOffset.UtcNow;
        post.Title = title;
        post.Body = body;
        post.Excerpt = Text.Excerpt(body);
        post.UpdatedAt = now;

        if (status == PostStatus.Published && post.Status != PostStatus.Published)
        {
            post.PublishedAt = now;
            post.Slug ??= await UniqueSlugAsync(title, db);
            post.ReviewNote = null;
        }
        else if (status != PostStatus.Published)
        {
            post.PublishedAt = null;
        }
        post.Status = status;
        if (status != PostStatus.Pending) post.PendingSlot = null;

        // Replace the image list with the submitted order; positions are renumbered 1..n.
        var keep = images.Select(i => i.PublicId).ToHashSet();
        var removed = post.Images.Where(i => !keep.Contains(i.PublicId)).Select(i => i.PublicId).ToList();
        db.PostImages.RemoveRange(post.Images);
        post.Images.Clear();
        post.Images.AddRange(images.Select((img, i) => new PostImage
        {
            PublicId = img.PublicId,
            Position = (short)(i + 1),
            AltText = string.IsNullOrWhiteSpace(img.AltText) ? null : img.AltText.Trim(),
            Width = img.Width,
            Height = img.Height,
            Format = img.Format.ToLowerInvariant(),
            Bytes = img.Bytes,
        }));

        if (post.Id == 0) db.Posts.Add(post);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "IX_Posts_AuthorId_PendingSlot" })
        {
            return Results.Problem(statusCode: 409, title: LimitMessage); // another request took the last slot
        }
        await DeleteUnusedAsync(removed, db, imageStore);
        return null;
    }

    /// Deletes images from the store unless another post still uses them, so a post can't remove someone else's image.
    static async Task DeleteUnusedAsync(List<string> publicIds, BlogDbContext db, ImageStore imageStore)
    {
        if (publicIds.Count == 0) return;
        var stillUsed = await db.PostImages.Where(i => publicIds.Contains(i.PublicId)).Select(i => i.PublicId).ToListAsync();
        await imageStore.DeleteAsync(publicIds.Except(stillUsed));
    }

    static async Task<string> UniqueSlugAsync(string title, BlogDbContext db)
    {
        var baseSlug = Text.Slugify(title);
        var slug = baseSlug;
        for (var n = 2; await db.Posts.AnyAsync(p => p.Slug == slug); n++)
            slug = $"{baseSlug[..Math.Min(baseSlug.Length, 76)]}-{n}";
        return slug;
    }
}
