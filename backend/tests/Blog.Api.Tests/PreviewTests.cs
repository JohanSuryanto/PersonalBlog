using System.Net;
using System.Text.RegularExpressions;
using Blog.Api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public class PreviewTests(BlogApiFactory factory) : ApiTest(factory)
{
    HttpClient PreviewClient() => Factory
        .WithWebHostBuilder(b => b.UseSetting("Cloudinary:CloudName", "testcloud").UseSetting("Site:Url", "https://blog.example/"))
        .CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

    static string? Meta(string html, string property) =>
        Regex.Match(html, $"""<meta (?:property|name)="{Regex.Escape(property)}" content="([^"]*)">""") is { Success: true } m
            ? WebUtility.HtmlDecode(m.Groups[1].Value)
            : null;

    [Fact]
    public async Task Published_post_has_open_graph_tags_with_cover_image()
    {
        var post = await Factory.SeedPostAsync("Beach day", body: "Salt air and sun", images: 2);
        var res = await PreviewClient().GetAsync($"/api/preview/posts/{post.Slug}");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("text/html", res.Content.Headers.ContentType?.MediaType);
        var html = await res.Content.ReadAsStringAsync();
        Assert.Equal("Beach day", Meta(html, "og:title"));
        Assert.Equal("Salt air and sun", Meta(html, "og:description"));
        Assert.Equal($"https://blog.example/posts/{post.Slug}", Meta(html, "og:url"));
        Assert.Equal("Test Author's blog", Meta(html, "og:site_name"));
        Assert.Equal("https://res.cloudinary.com/testcloud/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/blog/Beach day-1",
            Meta(html, "og:image"));
        Assert.Equal("summary_large_image", Meta(html, "twitter:card"));
    }

    [Fact]
    public async Task Text_only_post_uses_small_card_without_image()
    {
        var post = await Factory.SeedPostAsync("Just words");
        var html = await PreviewClient().GetStringAsync($"/api/preview/posts/{post.Slug}");
        Assert.Null(Meta(html, "og:image"));
        Assert.Equal("summary", Meta(html, "twitter:card"));
    }

    [Fact]
    public async Task Title_and_text_are_html_encoded()
    {
        var post = await Factory.SeedPostAsync("\"Quotes\" & <script>alert(1)</script>", body: "a < b");
        var html = await PreviewClient().GetStringAsync($"/api/preview/posts/{post.Slug}");
        Assert.DoesNotContain("<script>", html);
        Assert.Equal("\"Quotes\" & <script>alert(1)</script>", Meta(html, "og:title"));
        Assert.Equal("a < b", Meta(html, "og:description"));
    }

    [Fact]
    public async Task Drafts_and_missing_posts_are_404()
    {
        await Factory.SeedPostAsync("Draft", PostStatus.Draft);
        Assert.Equal(HttpStatusCode.NotFound, (await PreviewClient().GetAsync("/api/preview/posts/draft")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PreviewClient().GetAsync("/api/preview/posts/missing")).StatusCode);
    }
}
