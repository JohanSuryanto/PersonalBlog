using System.Xml.Linq;
using Blog.Api.Models;

namespace Blog.Api.Tests;

public class RssTests(BlogApiFactory factory) : ApiTest(factory)
{
    [Fact]
    public async Task Lists_published_posts_newest_first_with_links()
    {
        var day = new DateTimeOffset(2026, 3, 1, 9, 0, 0, TimeSpan.Zero);
        var older = await Factory.SeedPostAsync("Older <one>", publishedAt: day, body: "Older & wiser");
        var newer = await Factory.SeedPostAsync("Newer", publishedAt: day.AddDays(1));
        await Factory.SeedPostAsync("Secret", PostStatus.Draft);

        var res = await Factory.Client().GetAsync("/api/rss.xml");
        Assert.Equal("application/rss+xml", res.Content.Headers.ContentType?.MediaType);

        var channel = XDocument.Parse(await res.Content.ReadAsStringAsync()).Root!.Element("channel")!;
        Assert.Equal("Test Author's blog", channel.Element("title")!.Value);
        var items = channel.Elements("item").ToList();
        Assert.Equal(["Newer", "Older <one>"], items.Select(i => i.Element("title")!.Value));
        Assert.Equal($"https://localhost/posts/{newer.Slug}", items[0].Element("link")!.Value);
        Assert.Equal("Older & wiser", items[1].Element("description")!.Value);
        Assert.Equal(day.ToString("R"), items[1].Element("pubDate")!.Value);
        Assert.DoesNotContain(items, i => i.Element("title")!.Value == "Secret");
        Assert.NotNull(older.Slug);
    }
}
