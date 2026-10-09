using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Tests;

public class CommentTests(BlogApiFactory factory) : ApiTest(factory)
{
    static object Input(string name = "Sam", string body = "Nice post", string? website = null) => new { name, body, website };

    static async Task<List<JsonElement>> Items(HttpClient client, string url) =>
        (await client.GetFromJsonAsync<JsonElement>(url)).GetProperty("items").EnumerateArray().ToList();

    Task SeedCommentsAsync(int postId, int count) =>
        Factory.WithDbAsync(async db =>
        {
            db.Comments.AddRange(Enumerable.Range(1, count).Select(i => new Comment
            {
                PostId = postId, Name = $"Reader {i}", Body = $"Comment {i}", CreatedAt = DateTimeOffset.UtcNow,
            }));
            await db.SaveChangesAsync();
        });

    // ---------- US1: read and write ----------

    [Fact]
    public async Task Reader_adds_comment_and_sees_it()
    {
        var post = await Factory.SeedPostAsync("Trip");
        var client = Factory.Client();

        var res = await client.PostAsJsonAsync($"/api/posts/{post.Slug}/comments", Input("  Sam  ", "  <b>Hi</b>\nthere  "));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var created = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Sam", created.GetProperty("name").GetString());
        Assert.Equal("<b>Hi</b>\nthere", created.GetProperty("body").GetString());
        Assert.False(created.GetProperty("isAuthor").GetBoolean());

        var items = await Items(client, $"/api/posts/{post.Slug}/comments");
        Assert.Equal("<b>Hi</b>\nthere", Assert.Single(items).GetProperty("body").GetString());
    }

    [Fact]
    public async Task Lists_oldest_first_in_pages_of_50()
    {
        var post = await Factory.SeedPostAsync("Busy");
        await SeedCommentsAsync(post.Id, 55);
        var client = Factory.Client();

        var first = await client.GetFromJsonAsync<JsonElement>($"/api/posts/{post.Slug}/comments");
        var items = first.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(50, items.Count);
        Assert.True(first.GetProperty("hasMore").GetBoolean());
        Assert.Equal("Comment 1", items[0].GetProperty("body").GetString());

        var after = items[^1].GetProperty("id").GetInt32();
        var second = await client.GetFromJsonAsync<JsonElement>($"/api/posts/{post.Slug}/comments?after={after}");
        Assert.Equal(5, second.GetProperty("items").GetArrayLength());
        Assert.False(second.GetProperty("hasMore").GetBoolean());
        Assert.Equal("Comment 51", second.GetProperty("items")[0].GetProperty("body").GetString());
    }

    [Theory]
    [InlineData("", "Text", "Name")]
    [InlineData("   ", "Text", "Name")]
    [InlineData("Sam", "  \n ", "Body")]
    [InlineData("Sam", "", "Body")]
    public async Task Empty_fields_are_rejected(string name, string body, string field)
    {
        var post = await Factory.SeedPostAsync("Trip");
        var res = await Factory.Client().PostAsJsonAsync($"/api/posts/{post.Slug}/comments", Input(name, body));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.True((await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task Over_long_fields_are_rejected()
    {
        var post = await Factory.SeedPostAsync("Trip");
        var client = Factory.Client();
        var url = $"/api/posts/{post.Slug}/comments";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, Input(new string('a', 51)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, Input(body: new string('a', 2001)))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(url, Input(new string('a', 50), new string('b', 2000)))).StatusCode);
    }

    [Fact]
    public async Task Unpublished_and_missing_posts_are_404()
    {
        var post = await Factory.SeedPostAsync("Was public");
        await SeedCommentsAsync(post.Id, 1);
        await Factory.WithDbAsync(db => db.Posts.Where(p => p.Id == post.Id)
            .ExecuteUpdateAsync(p => p.SetProperty(x => x.Status, PostStatus.Draft)));
        var client = Factory.Client();

        foreach (var slug in new[] { post.Slug, "missing" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/posts/{slug}/comments")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/posts/{slug}/comments", Input())).StatusCode);
        }
    }

    [Fact]
    public async Task Author_comment_gets_badge_and_real_name()
    {
        var post = await Factory.SeedPostAsync("Trip");
        var author = await Factory.AuthorClientAsync();

        var res = await author.PostAsJsonAsync($"/api/posts/{post.Slug}/comments", Input("Impostor", "Thanks all"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var created = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(created.GetProperty("isAuthor").GetBoolean());
        Assert.Equal("Test Author", created.GetProperty("name").GetString());

        var noName = await author.PostAsJsonAsync($"/api/posts/{post.Slug}/comments", Input("", "Name not needed"));
        Assert.Equal(HttpStatusCode.Created, noName.StatusCode);
    }

    // ---------- US2: spam ----------

    [Fact]
    public async Task Honeypot_pretends_success_but_stores_nothing()
    {
        var post = await Factory.SeedPostAsync("Trip");
        var client = Factory.Client();

        var res = await client.PostAsJsonAsync($"/api/posts/{post.Slug}/comments", Input(website: "http://spam.example"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Empty(await Items(client, $"/api/posts/{post.Slug}/comments"));
    }

    [Fact]
    public async Task Rate_limit_refuses_extra_comments()
    {
        var post = await Factory.SeedPostAsync("Trip");
        using var limited = Factory.WithWebHostBuilder(b => b.UseSetting("Comments:RateLimit:PermitLimit", "2"));
        var client = limited.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var url = $"/api/posts/{post.Slug}/comments";

        for (var i = 0; i < 2; i++)
            Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(url, Input())).StatusCode);
        var third = await client.PostAsJsonAsync(url, Input());
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.NotNull(third.Headers.RetryAfter);
    }

    // ---------- US3: author deletes ----------

    [Fact]
    public async Task Anonymous_cannot_moderate()
    {
        var client = Factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/comments")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync("/api/admin/comments/1")).StatusCode);
    }

    [Fact]
    public async Task Author_deletes_comment()
    {
        var post = await Factory.SeedPostAsync("Trip");
        await SeedCommentsAsync(post.Id, 2);
        var author = await Factory.AuthorClientAsync();
        var first = (await Items(author, $"/api/posts/{post.Slug}/comments"))[0].GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.NoContent, (await author.DeleteAsync($"/api/admin/comments/{first}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await author.DeleteAsync($"/api/admin/comments/{first}")).StatusCode);
        Assert.Equal("Comment 2", Assert.Single(await Items(author, $"/api/posts/{post.Slug}/comments")).GetProperty("body").GetString());
    }

    [Fact]
    public async Task Admin_list_is_newest_first_across_posts_with_paging()
    {
        var published = await Factory.SeedPostAsync("Alpha", images: 2);
        var draft = await Factory.SeedPostAsync("Draft", PostStatus.Draft);
        await SeedCommentsAsync(published.Id, 15);
        await SeedCommentsAsync(draft.Id, 10);
        var author = await Factory.AuthorClientAsync();

        var first = await author.GetFromJsonAsync<JsonElement>("/api/admin/comments");
        var items = first.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(20, items.Count);
        Assert.True(first.GetProperty("hasMore").GetBoolean());
        Assert.Equal(25, first.GetProperty("total").GetInt32());
        Assert.Equal(25, first.GetProperty("lastWeek").GetInt32());
        var newest = items[0].GetProperty("post");
        Assert.Equal("Draft", newest.GetProperty("title").GetString());
        Assert.Equal("Draft", newest.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, newest.GetProperty("slug").ValueKind);

        var before = items[^1].GetProperty("id").GetInt32();
        var second = await author.GetFromJsonAsync<JsonElement>($"/api/admin/comments?before={before}");
        var rest = second.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(5, rest.Count);
        Assert.False(second.GetProperty("hasMore").GetBoolean());
        Assert.Equal(published.Slug, rest[0].GetProperty("post").GetProperty("slug").GetString());
        Assert.Equal("blog/Alpha-1", rest[0].GetProperty("post").GetProperty("coverPublicId").GetString());
    }

    [Fact]
    public async Task Deleting_post_deletes_its_comments()
    {
        var post = await Factory.SeedPostAsync("Trip");
        await SeedCommentsAsync(post.Id, 3);
        var author = await Factory.AuthorClientAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await author.DeleteAsync($"/api/admin/posts/{post.Id}")).StatusCode);
        await Factory.WithDbAsync(async db => Assert.Equal(0, await db.Comments.CountAsync()));
    }

    // ---------- US4: counts ----------

    [Fact]
    public async Task Feed_and_detail_show_comment_count()
    {
        var busy = await Factory.SeedPostAsync("Busy");
        var quiet = await Factory.SeedPostAsync("Quiet");
        await SeedCommentsAsync(busy.Id, 2);
        var client = Factory.Client();

        var feed = await Items(client, "/api/posts");
        Assert.Equal(2, feed.Single(i => i.GetProperty("id").GetInt32() == busy.Id).GetProperty("commentCount").GetInt32());
        Assert.Equal(0, feed.Single(i => i.GetProperty("id").GetInt32() == quiet.Id).GetProperty("commentCount").GetInt32());

        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/posts/{busy.Slug}");
        Assert.Equal(2, detail.GetProperty("commentCount").GetInt32());

        var admin = await (await Factory.AuthorClientAsync()).GetFromJsonAsync<JsonElement>($"/api/admin/posts/{busy.Id}");
        Assert.Equal(2, admin.GetProperty("commentCount").GetInt32());
    }
}
