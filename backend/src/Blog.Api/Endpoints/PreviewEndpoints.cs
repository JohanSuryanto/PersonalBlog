using System.Net;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Endpoints;

/// Link previews for chat apps and social sites. Their crawlers don't run JavaScript, so the frontend host
/// rewrites crawler requests for /posts/{slug} (and /?post={slug}) here; people still get the SPA.
public static class PreviewEndpoints
{
    public static void MapPreviewEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/preview/posts/{slug}", async (string slug, BlogDbContext db, IConfiguration config, HttpRequest request, HttpResponse response) =>
        {
            var post = await db.Posts.AsNoTracking()
                .Where(p => p.Slug == slug && p.Status == PostStatus.Published)
                .Select(p => new
                {
                    p.Title, p.Excerpt, PublishedAt = p.PublishedAt!.Value,
                    Cover = p.Images.OrderBy(i => i.Position).Select(i => new { i.PublicId, i.AltText }).FirstOrDefault(),
                })
                .FirstOrDefaultAsync();
            if (post is null) return Results.NotFound();

            var author = await db.Users.Select(u => u.DisplayName).FirstOrDefaultAsync() ?? "";
            var site = (config["Site:Url"] ?? $"{request.Scheme}://{request.Host}").TrimEnd('/');
            var siteName = string.IsNullOrEmpty(author) ? "Personal Blog" : $"{author}'s blog";
            var url = $"{site}/posts/{slug}";
            var cloud = config["Cloudinary:CloudName"];
            // 1200×630 is the size every major preview (Facebook, X, LinkedIn, WhatsApp, Slack) handles well.
            var image = post.Cover is { } cover && !string.IsNullOrEmpty(cloud)
                ? $"https://res.cloudinary.com/{cloud}/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/{cover.PublicId}"
                : null;

            static string E(string? s) => WebUtility.HtmlEncode(s ?? "");
            var imageTags = image is null ? "" : $"""
                <meta property="og:image" content="{E(image)}">
                <meta property="og:image:width" content="1200">
                <meta property="og:image:height" content="630">
                <meta property="og:image:alt" content="{E(post.Cover!.AltText ?? post.Title)}">
                <meta name="twitter:image" content="{E(image)}">
                """;

            var html = $"""
                <!doctype html>
                <html lang="en">
                <head>
                <meta charset="utf-8">
                <title>{E(post.Title)} · {E(siteName)}</title>
                <meta name="description" content="{E(post.Excerpt)}">
                <link rel="canonical" href="{E(url)}">
                <meta property="og:type" content="article">
                <meta property="og:site_name" content="{E(siteName)}">
                <meta property="og:title" content="{E(post.Title)}">
                <meta property="og:description" content="{E(post.Excerpt)}">
                <meta property="og:url" content="{E(url)}">
                <meta property="article:published_time" content="{post.PublishedAt.UtcDateTime:O}">
                <meta property="article:author" content="{E(author)}">
                <meta name="twitter:card" content="{(image is null ? "summary" : "summary_large_image")}">
                <meta name="twitter:title" content="{E(post.Title)}">
                <meta name="twitter:description" content="{E(post.Excerpt)}">
                {imageTags}
                </head>
                <body>
                <h1>{E(post.Title)}</h1>
                <p>{E(post.Excerpt)}</p>
                <p><a href="{E(url)}">Read the post</a></p>
                </body>
                </html>
                """;

            response.Headers.CacheControl = "public, max-age=300";
            return Results.Content(html, "text/html; charset=utf-8");
        });
    }
}
