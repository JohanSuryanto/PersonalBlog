using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Models;

namespace Blog.Api.Tests;

public class FeedTests(BlogApiFactory factory) : ApiTest(factory)
{
    internal static async Task<List<JsonElement>> ReadAll(HttpClient client, string query = "")
    {
        var all = new List<JsonElement>();
        string? cursor = null;
        do
        {
            var sep = query.Length > 0 ? "&" : "";
            var url = "/api/posts?" + query + (cursor is null ? "" : $"{sep}cursor={Uri.EscapeDataString(cursor)}");
            var page = await client.GetFromJsonAsync<JsonElement>(url);
            all.AddRange(page.GetProperty("items").EnumerateArray());
            cursor = page.GetProperty("nextCursor").GetString();
        } while (cursor is not null);
        return all;
    }

    [Fact]
    public async Task Pages_through_published_posts_newest_first()
    {
        var start = DateTimeOffset.UtcNow.AddDays(-30);
        for (var i = 0; i < 25; i++) await Factory.SeedPostAsync($"Post {i}", publishedAt: start.AddHours(i));
        for (var i = 0; i < 3; i++) await Factory.SeedPostAsync($"Draft {i}", PostStatus.Draft);

        var client = Factory.Client();
        var sizes = new List<int>();
        var titles = new List<string>();
        string? cursor = null;
        do
        {
            var page = await client.GetFromJsonAsync<JsonElement>("/api/posts" + (cursor is null ? "" : $"?cursor={Uri.EscapeDataString(cursor)}"));
            var items = page.GetProperty("items").EnumerateArray().ToList();
            sizes.Add(items.Count);
            titles.AddRange(items.Select(i => i.GetProperty("title").GetString()!));
            cursor = page.GetProperty("nextCursor").GetString();
        } while (cursor is not null);

        Assert.Equal([10, 10, 5], sizes);
        Assert.Equal(Enumerable.Range(0, 25).Reverse().Select(i => $"Post {i}"), titles);
    }

    [Fact]
    public async Task New_posts_during_scrolling_cause_no_duplicates_or_skips()
    {
        var start = DateTimeOffset.UtcNow.AddDays(-1);
        for (var i = 0; i < 15; i++) await Factory.SeedPostAsync($"Post {i}", publishedAt: start.AddMinutes(i));

        var client = Factory.Client();
        var first = await client.GetFromJsonAsync<JsonElement>("/api/posts");
        await Factory.SeedPostAsync("Brand new");
        var second = await client.GetFromJsonAsync<JsonElement>($"/api/posts?cursor={Uri.EscapeDataString(first.GetProperty("nextCursor").GetString()!)}");

        var titles = first.GetProperty("items").EnumerateArray().Concat(second.GetProperty("items").EnumerateArray())
            .Select(i => i.GetProperty("title").GetString()).ToList();
        Assert.Equal(Enumerable.Range(0, 15).Reverse().Select(i => $"Post {i}"), titles);
    }

    [Fact]
    public async Task Items_have_excerpt_and_ordered_images()
    {
        await Factory.SeedPostAsync("With images", images: 2, publishedAt: DateTimeOffset.UtcNow.AddMinutes(-1));
        await Factory.SeedPostAsync("Text only");

        var items = (await Factory.Client().GetFromJsonAsync<JsonElement>("/api/posts")).GetProperty("items").EnumerateArray().ToList();
        Assert.Empty(items[0].GetProperty("images").EnumerateArray());
        Assert.Equal(["blog/With images-1", "blog/With images-2"],
            items[1].GetProperty("images").EnumerateArray().Select(i => i.GetProperty("publicId").GetString()));
        Assert.Equal("Body of With images", items[1].GetProperty("excerpt").GetString());
    }

    [Fact]
    public async Task Profile_shows_author_and_published_count()
    {
        await Factory.SeedPostAsync("One");
        await Factory.SeedPostAsync("Two");
        await Factory.SeedPostAsync("Hidden", PostStatus.Draft);

        var profile = await Factory.Client().GetFromJsonAsync<JsonElement>("/api/profile");
        Assert.Equal("Test Author", profile.GetProperty("displayName").GetString());
        Assert.Equal(2, profile.GetProperty("postCount").GetInt32());
    }

    [Fact]
    public async Task Invalid_cursor_is_400() =>
        Assert.Equal(HttpStatusCode.BadRequest, (await Factory.Client().GetAsync("/api/posts?cursor=garbage!")).StatusCode);

    [Fact]
    public async Task Empty_feed()
    {
        var page = await Factory.Client().GetFromJsonAsync<JsonElement>("/api/posts");
        Assert.Empty(page.GetProperty("items").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("nextCursor").ValueKind);
    }
}
