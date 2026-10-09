using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Endpoints;

public record ImageInput(string PublicId, int Width, int Height, string Format, int Bytes, string? AltText);
public record PostInput(string? Title, string? Body, PostStatus Status, List<ImageInput>? Images);
public record AdminPostSummary(int Id, string Title, string? Slug, string Status, DateTimeOffset UpdatedAt, DateTimeOffset? PublishedAt, int ImageCount, string? CoverPublicId);

public static class AdminPostEndpoints
{
    public static void MapAdminPostEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin/posts").RequireAuthorization();

        admin.MapGet("/", (BlogDbContext db) => db.Posts.AsNoTracking()
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new AdminPostSummary(p.Id, p.Title, p.Slug, p.Status.ToString(), p.UpdatedAt, p.PublishedAt, p.Images.Count,
                p.Images.OrderBy(i => i.Position).Select(i => i.PublicId).FirstOrDefault()))
            .ToListAsync());

        admin.MapGet("/{id:int}", async (int id, BlogDbContext db) =>
            await db.Posts.Include(p => p.Images).AsNoTracking().FirstOrDefaultAsync(p => p.Id == id) is { } post
                ? Results.Ok(await PostEndpoints.ToDetailAsync(post, db) with { CommentCount = await db.Comments.CountAsync(c => c.PostId == id) })
                : Results.NotFound());

        admin.MapPost("/", async (PostInput input, BlogDbContext db, ImageStore images) =>
        {
            var now = DateTimeOffset.UtcNow;
            var post = new Post { Title = "", Body = "", CreatedAt = now };
            var result = await SaveAsync(post, input, db, images);
            if (result is not null) return result;
            return Results.Created($"/api/admin/posts/{post.Id}", await PostEndpoints.ToDetailAsync(post, db));
        });

        admin.MapPut("/{id:int}", async (int id, PostInput input, BlogDbContext db, ImageStore images) =>
        {
            var post = await db.Posts.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (post is null) return Results.NotFound();
            return await SaveAsync(post, input, db, images) ?? Results.Ok(await PostEndpoints.ToDetailAsync(post, db));
        });

        admin.MapDelete("/{id:int}", async (int id, BlogDbContext db, ImageStore images) =>
        {
            var post = await db.Posts.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (post is null) return Results.NotFound();
            var publicIds = post.Images.Select(i => i.PublicId).ToList();
            db.Posts.Remove(post);
            await db.SaveChangesAsync();
            await images.DeleteAsync(publicIds);
            return Results.NoContent();
        });
    }

    /// Validates and applies the input. Returns an error result, or null on success.
    static async Task<IResult?> SaveAsync(Post post, PostInput input, BlogDbContext db, ImageStore imageStore)
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
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        var now = DateTimeOffset.UtcNow;
        post.Title = title;
        post.Body = body;
        post.Excerpt = Text.Excerpt(body);
        post.UpdatedAt = now;

        if (input.Status == PostStatus.Published && post.Status != PostStatus.Published)
        {
            post.PublishedAt = now;
            post.Slug ??= await UniqueSlugAsync(title, db);
        }
        else if (input.Status == PostStatus.Draft)
        {
            post.PublishedAt = null;
        }
        post.Status = input.Status;

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
        await db.SaveChangesAsync();
        await imageStore.DeleteAsync(removed);
        return null;
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
