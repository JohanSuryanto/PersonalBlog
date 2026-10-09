using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static Blog.Api.Tests.AdminPostTests;

namespace Blog.Api.Tests;

public class PostValidationTests(BlogApiFactory factory) : ApiTest(factory)
{
    async Task<JsonElement> ExpectBadRequest(object input)
    {
        var author = await Factory.AuthorClientAsync();
        var res = await author.PostAsJsonAsync("/api/admin/posts", input);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
    }

    [Fact]
    public async Task Title_and_body_are_required()
    {
        var errors = await ExpectBadRequest(Input(title: "  ", body: ""));
        Assert.True(errors.TryGetProperty("Title", out _));
        Assert.True(errors.TryGetProperty("Body", out _));
    }

    [Fact]
    public async Task Title_max_200() => await ExpectBadRequest(Input(title: new string('a', 201)));

    [Fact]
    public async Task At_most_10_images()
    {
        var errors = await ExpectBadRequest(Input(images: Enumerable.Range(0, 11).Select(i => Image($"blog/{i}")).ToArray()));
        Assert.Contains("maximum 10 images", errors.GetProperty("Images")[0].GetString());
    }

    [Fact]
    public async Task Only_image_formats() => await ExpectBadRequest(Input(images: [Image("blog/a", format: "pdf")]));

    [Fact]
    public async Task Max_10_MB() => await ExpectBadRequest(Input(images: [Image("blog/a", bytes: 10 * 1024 * 1024 + 1)]));

    [Fact]
    public async Task Ten_images_of_10_MB_are_accepted()
    {
        var author = await Factory.AuthorClientAsync();
        var images = Enumerable.Range(0, 10).Select(i => Image($"blog/{i}", bytes: 10 * 1024 * 1024)).ToArray();
        var res = await author.PostAsJsonAsync("/api/admin/posts", Input(images: images));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var post = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(Enumerable.Range(1, 10), post.GetProperty("images").EnumerateArray().Select(i => i.GetProperty("position").GetInt32()));
    }

    [Fact]
    public async Task Reordering_renumbers_positions_and_removing_deletes_from_storage()
    {
        var author = await Factory.AuthorClientAsync();
        var created = await (await author.PostAsJsonAsync("/api/admin/posts",
            Input(images: [Image("blog/a"), Image("blog/b"), Image("blog/c")]))).Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetInt32();

        var updated = await (await author.PutAsJsonAsync($"/api/admin/posts/{id}",
            Input(images: [Image("blog/c", alt: "Cover"), Image("blog/a")]))).Content.ReadFromJsonAsync<JsonElement>();

        var images = updated.GetProperty("images").EnumerateArray().ToList();
        Assert.Equal(["blog/c", "blog/a"], images.Select(i => i.GetProperty("publicId").GetString()));
        Assert.Equal([1, 2], images.Select(i => i.GetProperty("position").GetInt32()));
        Assert.Equal("Cover", images[0].GetProperty("altText").GetString());
        Assert.Equal(["blog/b"], Factory.Images.Deleted);
    }
}
