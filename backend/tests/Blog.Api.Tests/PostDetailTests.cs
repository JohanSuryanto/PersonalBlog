using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Blog.Api.Tests;

public class PostDetailTests(BlogApiFactory factory) : ApiTest(factory)
{
    [Fact]
    public async Task Published_post_returns_body_and_ordered_images()
    {
        var post = await Factory.SeedPostAsync("Hello", body: "# Markdown body", images: 3);
        var detail = await Factory.Client().GetFromJsonAsync<JsonElement>($"/api/posts/{post.Slug}");

        Assert.Equal("# Markdown body", detail.GetProperty("body").GetString());
        Assert.Equal([1, 2, 3], detail.GetProperty("images").EnumerateArray().Select(i => i.GetProperty("position").GetInt32()));
        Assert.Equal("Test Author", detail.GetProperty("author").GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task Links_to_newer_and_older_published_posts()
    {
        var day = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var oldest = await Factory.SeedPostAsync("Oldest", publishedAt: day);
        var middle = await Factory.SeedPostAsync("Middle", publishedAt: day.AddDays(1));
        await Factory.SeedPostAsync("Draft in between", Blog.Api.Models.PostStatus.Draft);
        var newest = await Factory.SeedPostAsync("Newest", publishedAt: day.AddDays(2));
        var client = Factory.Client();

        var mid = await client.GetFromJsonAsync<JsonElement>($"/api/posts/{middle.Slug}");
        Assert.Equal(newest.Slug, mid.GetProperty("newer").GetProperty("slug").GetString());
        Assert.Equal("Oldest", mid.GetProperty("older").GetProperty("title").GetString());

        var first = await client.GetFromJsonAsync<JsonElement>($"/api/posts/{oldest.Slug}");
        Assert.Equal(JsonValueKind.Null, first.GetProperty("older").ValueKind);
        var last = await client.GetFromJsonAsync<JsonElement>($"/api/posts/{newest.Slug}");
        Assert.Equal(JsonValueKind.Null, last.GetProperty("newer").ValueKind);
    }

    [Fact]
    public async Task Unknown_slug_is_404() =>
        Assert.Equal(HttpStatusCode.NotFound, (await Factory.Client().GetAsync("/api/posts/does-not-exist")).StatusCode);
}
