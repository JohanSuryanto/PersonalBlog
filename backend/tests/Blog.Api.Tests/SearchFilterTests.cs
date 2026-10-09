using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Models;
using static Blog.Api.Tests.FeedTests;

namespace Blog.Api.Tests;

public class SearchFilterTests(BlogApiFactory factory) : ApiTest(factory)
{
    static List<string?> Titles(List<JsonElement> items) => items.Select(i => i.GetProperty("title").GetString()).ToList();

    [Fact]
    public async Task Keyword_matches_title_or_body_case_insensitively()
    {
        await Factory.SeedPostAsync("Mountain trip", body: "Lots of snow");
        await Factory.SeedPostAsync("Beach day", body: "We took a TRIP to the sea");
        await Factory.SeedPostAsync("Cooking", body: "Pasta");
        await Factory.SeedPostAsync("Trip draft", PostStatus.Draft);

        var titles = Titles(await ReadAll(Factory.Client(), "q=trip"));
        Assert.Equal(["Beach day", "Mountain trip"], titles.Order());
    }

    [Theory]
    [InlineData("%", "100% fun")]
    [InlineData("_", "snake_case")]
    public async Task Wildcards_match_literally(string q, string expected)
    {
        await Factory.SeedPostAsync("100% fun");
        await Factory.SeedPostAsync("snake_case");
        await Factory.SeedPostAsync("plain");
        Assert.Equal([expected], Titles(await ReadAll(Factory.Client(), "q=" + Uri.EscapeDataString(q))));
    }

    [Fact]
    public async Task Whitespace_query_means_no_filter()
    {
        await Factory.SeedPostAsync("A");
        await Factory.SeedPostAsync("B");
        Assert.Equal(2, (await ReadAll(Factory.Client(), "q=%20%20")).Count);
    }

    [Fact]
    public async Task Date_range_is_inclusive_by_whole_day()
    {
        await Factory.SeedPostAsync("Dec 31", publishedAt: new DateTimeOffset(2025, 12, 31, 23, 59, 0, TimeSpan.Zero));
        await Factory.SeedPostAsync("Jan 1", publishedAt: new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
        await Factory.SeedPostAsync("Jan 31", publishedAt: new DateTimeOffset(2026, 1, 31, 23, 59, 59, TimeSpan.Zero));
        await Factory.SeedPostAsync("Feb 1", publishedAt: new DateTimeOffset(2026, 2, 1, 0, 0, 0, TimeSpan.Zero));

        var client = Factory.Client();
        Assert.Equal(["Jan 31", "Jan 1"], Titles(await ReadAll(client, "from=2026-01-01&to=2026-01-31")));
        Assert.Equal(["Feb 1", "Jan 31", "Jan 1"], Titles(await ReadAll(client, "from=2026-01-01")));
        Assert.Equal(["Dec 31"], Titles(await ReadAll(client, "to=2025-12-31")));
    }

    [Fact]
    public async Task From_after_to_is_400() =>
        Assert.Equal(HttpStatusCode.BadRequest, (await Factory.Client().GetAsync("/api/posts?from=2026-02-01&to=2026-01-01")).StatusCode);

    [Fact]
    public async Task Keyword_and_dates_combine_and_survive_paging()
    {
        var jan = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        for (var i = 0; i < 12; i++) await Factory.SeedPostAsync($"Trip {i}", publishedAt: jan.AddDays(i));
        await Factory.SeedPostAsync("Trip in March", publishedAt: new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero));
        await Factory.SeedPostAsync("Other", publishedAt: jan.AddDays(1));

        var items = await ReadAll(Factory.Client(), "q=trip&from=2026-01-01&to=2026-01-31");
        Assert.Equal(12, items.Count);
        Assert.All(Titles(items), t => Assert.StartsWith("Trip ", t));
        Assert.DoesNotContain("Trip in March", Titles(items));
    }
}
