using System.Globalization;
using System.Text;
using System.Xml.Linq;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Endpoints;

public record ImageDto(string PublicId, int Width, int Height, string? AltText);
public record FeedItem(int Id, string Slug, string Title, string Excerpt, DateTimeOffset PublishedAt, List<ImageDto> Images, int CommentCount);
public record Profile(string DisplayName, string? Bio, int PostCount);
public record FeedPage(List<FeedItem> Items, string? NextCursor);
public record PostImageDto(string PublicId, int Position, int Width, int Height, string Format, int Bytes, string? AltText);
public record AuthorDto(string DisplayName);
public record PostDetail(int Id, string? Slug, string Title, string Body, DateTimeOffset? PublishedAt, DateTimeOffset UpdatedAt,
    AuthorDto Author, List<PostImageDto> Images, string Status, PostLink? Newer = null, PostLink? Older = null, int CommentCount = 0);
public record PostLink(string Slug, string Title);

public static class PostEndpoints
{
    const int BatchSize = 10;

    public static void MapPostEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/posts", GetFeed);
        app.MapGet("/api/rss.xml", GetRss);
        app.MapGet("/api/profile", async (BlogDbContext db, IConfiguration config) => new Profile(
            await db.Users.Select(u => u.DisplayName).FirstOrDefaultAsync() ?? "",
            config["Author:Bio"],
            await db.Posts.CountAsync(p => p.Status == PostStatus.Published)));
        app.MapGet("/api/posts/{slug}", async (string slug, BlogDbContext db) =>
        {
            var post = await db.Posts.Include(p => p.Images).AsNoTracking()
                .FirstOrDefaultAsync(p => p.Slug == slug && p.Status == PostStatus.Published);
            if (post is null) return Results.NotFound();

            // Neighbours in feed order (PublishedAt, Id), for Newer / Older navigation.
            var at = post.PublishedAt;
            var published = db.Posts.AsNoTracking().Where(p => p.Status == PostStatus.Published);
            var newer = await published
                .Where(p => p.PublishedAt > at || (p.PublishedAt == at && p.Id > post.Id))
                .OrderBy(p => p.PublishedAt).ThenBy(p => p.Id)
                .Select(p => new PostLink(p.Slug!, p.Title)).FirstOrDefaultAsync();
            var older = await published
                .Where(p => p.PublishedAt < at || (p.PublishedAt == at && p.Id < post.Id))
                .OrderByDescending(p => p.PublishedAt).ThenByDescending(p => p.Id)
                .Select(p => new PostLink(p.Slug!, p.Title)).FirstOrDefaultAsync();

            var comments = await db.Comments.CountAsync(c => c.PostId == post.Id);

            return Results.Ok(await ToDetailAsync(post, db) with { Newer = newer, Older = older, CommentCount = comments });
        });
    }

    static async Task<IResult> GetFeed(BlogDbContext db, string? cursor, string? q, DateOnly? from, DateOnly? to)
    {
        if (from > to)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["from"] = ["\"from\" must be on or before \"to\"."] });

        var query = db.Posts.AsNoTracking().Where(p => p.Status == PostStatus.Published);

        if (!string.IsNullOrWhiteSpace(q))
        {
            // ponytail: sequential ILIKE scan, add pg_trgm GIN index if posts exceed ~10k
            var pattern = "%" + q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(p => EF.Functions.ILike(p.Title, pattern, "\\") || EF.Functions.ILike(p.Body, pattern, "\\"));
        }
        if (from is { } f)
        {
            var start = new DateTimeOffset(f.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            query = query.Where(p => p.PublishedAt >= start);
        }
        if (to is { } t)
        {
            var end = new DateTimeOffset(t.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            query = query.Where(p => p.PublishedAt < end);
        }
        if (cursor is not null)
        {
            if (!TryDecodeCursor(cursor, out var at, out var id))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["cursor"] = ["Invalid cursor."] });
            query = query.Where(p => p.PublishedAt < at || (p.PublishedAt == at && p.Id < id));
        }

        var rows = await query
            .OrderByDescending(p => p.PublishedAt).ThenByDescending(p => p.Id)
            .Take(BatchSize + 1)
            .Select(p => new
            {
                p.Id, p.Slug, p.Title, p.Excerpt, PublishedAt = p.PublishedAt!.Value,
                Images = p.Images.OrderBy(i => i.Position).Select(i => new ImageDto(i.PublicId, i.Width, i.Height, i.AltText)).ToList(),
                // ponytail: correlated count per item, add a denormalised column if the feed gets slow
                CommentCount = p.Comments.Count,
            })
            .ToListAsync();

        var items = rows.Take(BatchSize).Select(r => new FeedItem(r.Id, r.Slug!, r.Title, r.Excerpt, r.PublishedAt, r.Images, r.CommentCount)).ToList();
        var next = rows.Count > BatchSize ? EncodeCursor(items[^1].PublishedAt, items[^1].Id) : null;
        return Results.Ok(new FeedPage(items, next));
    }

    /// RSS 2.0 of the 20 newest published posts. Links use Site:Url (the public frontend address) when set,
    /// since behind the frontend's /api rewrite the request host is the backend's.
    static async Task<IResult> GetRss(BlogDbContext db, IConfiguration config, HttpRequest request)
    {
        var site = (config["Site:Url"] ?? $"{request.Scheme}://{request.Host}").TrimEnd('/');
        var author = await db.Users.Select(u => u.DisplayName).FirstOrDefaultAsync() ?? "";
        var posts = await db.Posts.AsNoTracking()
            .Where(p => p.Status == PostStatus.Published)
            .OrderByDescending(p => p.PublishedAt).ThenByDescending(p => p.Id)
            .Take(20)
            .Select(p => new { p.Slug, p.Title, p.Excerpt, PublishedAt = p.PublishedAt!.Value })
            .ToListAsync();

        var title = config["Site:Name"] ?? (string.IsNullOrEmpty(author) ? "Blog" : $"{author}'s blog");
        var rss = new XDocument(new XDeclaration("1.0", "utf-8", null), new XElement("rss", new XAttribute("version", "2.0"),
            new XElement("channel",
                new XElement("title", title),
                new XElement("link", site + "/"),
                new XElement("description", config["Author:Bio"] is { Length: > 0 } bio ? bio : "Stories, photos and notes."),
                new XElement("language", "en"),
                posts.Count > 0 ? new XElement("lastBuildDate", posts[0].PublishedAt.ToString("R")) : null,
                posts.Select(p => new XElement("item",
                    new XElement("title", p.Title),
                    new XElement("link", $"{site}/posts/{p.Slug}"),
                    new XElement("guid", new XAttribute("isPermaLink", "true"), $"{site}/posts/{p.Slug}"),
                    new XElement("pubDate", p.PublishedAt.ToString("R")),
                    new XElement("description", p.Excerpt))))));

        return Results.Text($"{rss.Declaration}\n{rss}", "application/rss+xml; charset=utf-8");
    }

    internal static async Task<PostDetail> ToDetailAsync(Post post, BlogDbContext db)
    {
        var author = await db.Users.AsNoTracking().Select(u => u.DisplayName).FirstOrDefaultAsync() ?? "";
        var images = post.Images.OrderBy(i => i.Position)
            .Select(i => new PostImageDto(i.PublicId, i.Position, i.Width, i.Height, i.Format, i.Bytes, i.AltText)).ToList();
        return new PostDetail(post.Id, post.Slug, post.Title, post.Body, post.PublishedAt, post.UpdatedAt,
            new AuthorDto(author), images, post.Status.ToString());
    }

    static string EncodeCursor(DateTimeOffset at, int id) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{at.UtcDateTime:O}|{id}"));

    static bool TryDecodeCursor(string cursor, out DateTimeOffset at, out int id)
    {
        at = default;
        id = 0;
        try
        {
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|');
            return parts.Length == 2
                && DateTimeOffset.TryParse(parts[0], CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out at)
                && int.TryParse(parts[1], out id);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
