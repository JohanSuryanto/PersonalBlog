using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Blog.Api.Tests;

public class AdminPostTests(BlogApiFactory factory) : ApiTest(factory)
{
    internal static object Image(string id, string format = "jpg", int bytes = 1000, string? alt = null) =>
        new { publicId = id, width = 800, height = 600, format, bytes, altText = alt };

    internal static object Input(string title = "Trip", string body = "Hello **world**", string status = "Draft", params object[] images) =>
        new { title, body, status, images };

    [Fact]
    public async Task Anonymous_cannot_write()
    {
        var client = Factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/posts")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/admin/posts", Input())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync("/api/admin/posts/1", Input())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync("/api/admin/posts/1")).StatusCode);
    }

    [Fact]
    public async Task Full_publishing_flow()
    {
        var author = await Factory.AuthorClientAsync();
        var anon = Factory.Client();

        // Create draft: invisible to readers.
        var created = await author.PostAsJsonAsync("/api/admin/posts", Input(images: [Image("blog/a"), Image("blog/b"), Image("blog/c")]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var draft = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = draft.GetProperty("id").GetInt32();
        Assert.Equal("Draft", draft.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, draft.GetProperty("slug").ValueKind);
        Assert.Empty((await anon.GetFromJsonAsync<JsonElement>("/api/posts")).GetProperty("items").EnumerateArray());

        // Publish: slug + publish date assigned, publicly visible with images in order.
        var published = await (await author.PutAsJsonAsync($"/api/admin/posts/{id}",
            Input(status: "Published", images: [Image("blog/c"), Image("blog/a"), Image("blog/b")]))).Content.ReadFromJsonAsync<JsonElement>();
        var slug = published.GetProperty("slug").GetString();
        Assert.Equal("trip", slug);
        Assert.NotEqual(JsonValueKind.Null, published.GetProperty("publishedAt").ValueKind);

        var pub = await anon.GetFromJsonAsync<JsonElement>($"/api/posts/{slug}");
        Assert.Equal(["blog/c", "blog/a", "blog/b"], pub.GetProperty("images").EnumerateArray().Select(i => i.GetProperty("publicId").GetString()));
        Assert.Equal("Test Author", pub.GetProperty("author").GetProperty("displayName").GetString());

        // Edit while published: change visible, slug stable.
        await author.PutAsJsonAsync($"/api/admin/posts/{id}", Input(title: "Trip renamed", body: "Updated", status: "Published", images: [Image("blog/c")]));
        pub = await anon.GetFromJsonAsync<JsonElement>($"/api/posts/{slug}");
        Assert.Equal("Trip renamed", pub.GetProperty("title").GetString());
        Assert.Equal("Updated", pub.GetProperty("body").GetString());
        Assert.Equal(["blog/a", "blog/b"], Factory.Images.Deleted.Order());

        // Unpublish: gone for readers, publish date cleared.
        var unpublished = await (await author.PutAsJsonAsync($"/api/admin/posts/{id}", Input(status: "Draft", images: [Image("blog/c")])))
            .Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, unpublished.GetProperty("publishedAt").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/posts/{slug}")).StatusCode);
        Assert.Empty((await anon.GetFromJsonAsync<JsonElement>("/api/posts")).GetProperty("items").EnumerateArray());

        // Delete: removed, images deleted from storage.
        Assert.Equal(HttpStatusCode.NoContent, (await author.DeleteAsync($"/api/admin/posts/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await author.GetAsync($"/api/admin/posts/{id}")).StatusCode);
        Assert.Contains("blog/c", Factory.Images.Deleted);
    }

    [Fact]
    public async Task Admin_list_includes_drafts_with_status()
    {
        await Factory.SeedPostAsync("Published one", images: 2);
        await Factory.SeedPostAsync("Draft one", Blog.Api.Models.PostStatus.Draft);
        var author = await Factory.AuthorClientAsync();

        var list = await author.GetFromJsonAsync<JsonElement>("/api/admin/posts");
        var rows = list.EnumerateArray().ToDictionary(p => p.GetProperty("title").GetString()!, p => p);
        Assert.Equal("Draft", rows["Draft one"].GetProperty("status").GetString());
        Assert.Equal(2, rows["Published one"].GetProperty("imageCount").GetInt32());
        Assert.Equal("blog/Published one-1", rows["Published one"].GetProperty("coverPublicId").GetString());
        Assert.Equal(JsonValueKind.Null, rows["Draft one"].GetProperty("coverPublicId").ValueKind);
    }

    [Fact]
    public async Task Slug_collisions_get_a_suffix()
    {
        var author = await Factory.AuthorClientAsync();
        var a = await (await author.PostAsJsonAsync("/api/admin/posts", Input(title: "Same title", status: "Published"))).Content.ReadFromJsonAsync<JsonElement>();
        var b = await (await author.PostAsJsonAsync("/api/admin/posts", Input(title: "Same title", status: "Published"))).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("same-title", a.GetProperty("slug").GetString());
        Assert.Equal("same-title-2", b.GetProperty("slug").GetString());
    }

    [Fact]
    public async Task Draft_is_not_reachable_by_direct_address()
    {
        var post = await Factory.SeedPostAsync("Secret", Blog.Api.Models.PostStatus.Draft);
        await Factory.WithDbAsync(async db =>
        {
            db.Attach(post).Entity.Slug = "secret";
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.NotFound, (await Factory.Client().GetAsync("/api/posts/secret")).StatusCode);
    }
}
