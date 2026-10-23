using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Models;
using Microsoft.EntityFrameworkCore;
using static Blog.Api.Tests.AdminPostTests;

namespace Blog.Api.Tests;

/// Spec 004: contributors submit posts that wait for the owner's approval, at most 2 at a time.
public class ContributorPostTests(BlogApiFactory factory) : ApiTest(factory)
{
    const string Limit = "You have 2 of 2 posts waiting for approval. Wait for one to be reviewed or delete one.";

    static async Task<JsonElement> Json(HttpResponseMessage res) => await res.Content.ReadFromJsonAsync<JsonElement>();

    static async Task<int> SubmitAsync(HttpClient client, string title = "Story")
    {
        var res = await client.PostAsJsonAsync("/api/admin/posts", Input(title: title));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await Json(res)).GetProperty("id").GetInt32();
    }

    async Task<int> PendingCountAsync()
    {
        var n = 0;
        await Factory.WithDbAsync(async db => n = await db.Posts.CountAsync(p => p.Status == PostStatus.Pending));
        return n;
    }

    // ---------- US1: submit ----------

    [Fact]
    public async Task Contributor_post_is_saved_as_pending_even_if_published_is_requested()
    {
        var writer = await Factory.ContributorClientAsync();
        var res = await writer.PostAsJsonAsync("/api/admin/posts", Input(status: "Published"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var post = await Json(res);
        Assert.Equal("Pending", post.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, post.GetProperty("slug").ValueKind);
        Assert.Equal("Writer", post.GetProperty("author").GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task Pending_post_is_not_public()
    {
        await SubmitAsync(await Factory.ContributorClientAsync());
        var feed = await Factory.Client().GetFromJsonAsync<JsonElement>("/api/posts");
        Assert.Empty(feed.GetProperty("items").EnumerateArray());
        Assert.Equal(0, (await Factory.Client().GetFromJsonAsync<JsonElement>("/api/profile")).GetProperty("postCount").GetInt32());
    }

    [Fact]
    public async Task Contributor_lists_only_own_posts()
    {
        await Factory.SeedPostAsync("Owner draft", PostStatus.Draft);
        await Factory.SeedPostAsync("Owner published");
        await SubmitAsync(await Factory.ContributorClientAsync("sub-other", "other@example.com", "Other"), "Not mine");
        var writer = await Factory.ContributorClientAsync();
        await SubmitAsync(writer, "Mine");

        var list = await writer.GetFromJsonAsync<JsonElement>("/api/admin/posts");
        var item = Assert.Single(list.EnumerateArray());
        Assert.Equal("Mine", item.GetProperty("title").GetString());
        Assert.Equal("Writer", item.GetProperty("authorName").GetString());
        Assert.Equal("Pending", item.GetProperty("status").GetString());

        var owner = await Factory.AuthorClientAsync();
        Assert.Equal(4, (await owner.GetFromJsonAsync<JsonElement>("/api/admin/posts")).GetArrayLength());
    }

    [Fact]
    public async Task Contributor_cannot_read_edit_or_delete_others_posts()
    {
        var draft = await Factory.SeedPostAsync("Owner draft", PostStatus.Draft);
        var otherId = await SubmitAsync(await Factory.ContributorClientAsync("sub-other", "other@example.com", "Other"));
        var writer = await Factory.ContributorClientAsync();

        foreach (var id in new[] { draft.Id, otherId })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await writer.GetAsync($"/api/admin/posts/{id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input())).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await writer.DeleteAsync($"/api/admin/posts/{id}")).StatusCode);
        }
    }

    [Fact]
    public async Task Contributor_can_edit_own_pending_post_and_it_stays_pending()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        var res = await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input(title: "Better title", status: "Draft"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var post = await Json(res);
        Assert.Equal("Better title", post.GetProperty("title").GetString());
        Assert.Equal("Pending", post.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Contributor_can_delete_own_pending_post()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        Assert.Equal(HttpStatusCode.NoContent, (await writer.DeleteAsync($"/api/admin/posts/{id}")).StatusCode);
        Assert.Equal(0, await PendingCountAsync());
    }

    [Fact]
    public async Task Me_reports_isOwner()
    {
        var owner = await Factory.AuthorClientAsync();
        var writer = await Factory.ContributorClientAsync();
        Assert.True((await owner.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("isOwner").GetBoolean());
        Assert.False((await writer.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("isOwner").GetBoolean());
    }

    // ---------- US2: the 2-post limit ----------

    [Fact]
    public async Task Third_pending_post_is_refused_with_409_and_nothing_saved()
    {
        var writer = await Factory.ContributorClientAsync();
        await SubmitAsync(writer);
        await SubmitAsync(writer);
        var res = await writer.PostAsJsonAsync("/api/admin/posts", Input());
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal(Limit, (await Json(res)).GetProperty("title").GetString());
        Assert.Equal(2, await PendingCountAsync());
    }

    [Fact]
    public async Task Simultaneous_submissions_never_exceed_two()
    {
        var writer = await Factory.ContributorClientAsync();
        await SubmitAsync(writer);
        var results = await Task.WhenAll(Enumerable.Range(0, 3).Select(i => writer.PostAsJsonAsync("/api/admin/posts", Input(title: $"Race {i}"))));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created);
        Assert.All(results.Where(r => r.StatusCode != HttpStatusCode.Created), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(2, await PendingCountAsync());
    }

    [Fact]
    public async Task Deleting_a_pending_post_frees_a_slot()
    {
        var writer = await Factory.ContributorClientAsync();
        var first = await SubmitAsync(writer);
        await SubmitAsync(writer);
        await writer.DeleteAsync($"/api/admin/posts/{first}");
        await SubmitAsync(writer);
    }

    [Fact]
    public async Task Editing_a_pending_post_does_not_use_another_slot()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        await SubmitAsync(writer);
        Assert.Equal(HttpStatusCode.OK, (await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input(title: "Edited"))).StatusCode);
    }

    [Fact]
    public async Task Slots_are_per_contributor()
    {
        var a = await Factory.ContributorClientAsync();
        var b = await Factory.ContributorClientAsync("sub-other", "other@example.com", "Other");
        foreach (var writer in new[] { a, b }) { await SubmitAsync(writer); await SubmitAsync(writer); }
        Assert.Equal(4, await PendingCountAsync());
    }

    // ---------- US3: approve / reject ----------

    [Fact]
    public async Task Owner_approves_pending_post()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer, "Guest story");
        await SubmitAsync(writer);
        var owner = await Factory.AuthorClientAsync();

        var res = await owner.PostAsync($"/api/admin/posts/{id}/approve", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var post = await Json(res);
        Assert.Equal("Published", post.GetProperty("status").GetString());
        var slug = post.GetProperty("slug").GetString();
        Assert.Equal("guest-story", slug);

        var anon = Factory.Client();
        Assert.Equal("Writer", (await anon.GetFromJsonAsync<JsonElement>($"/api/posts/{slug}")).GetProperty("author").GetProperty("displayName").GetString());
        var item = Assert.Single((await anon.GetFromJsonAsync<JsonElement>("/api/posts")).GetProperty("items").EnumerateArray());
        Assert.Equal("Writer", item.GetProperty("authorName").GetString());
        Assert.Equal("Test Author", (await anon.GetFromJsonAsync<JsonElement>("/api/profile")).GetProperty("displayName").GetString());

        await SubmitAsync(writer); // slot freed: 1/2 -> 2/2
    }

    [Fact]
    public async Task Owner_rejects_with_note()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        await SubmitAsync(writer);
        var owner = await Factory.AuthorClientAsync();

        var res = await owner.PostAsJsonAsync($"/api/admin/posts/{id}/reject", new { note = "  Needs photos  " });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("Rejected", (await Json(res)).GetProperty("status").GetString());

        var mine = await writer.GetFromJsonAsync<JsonElement>($"/api/admin/posts/{id}");
        Assert.Equal("Needs photos", mine.GetProperty("reviewNote").GetString());
        var listed = (await writer.GetFromJsonAsync<JsonElement>("/api/admin/posts")).EnumerateArray().Single(p => p.GetProperty("id").GetInt32() == id);
        Assert.Equal("Needs photos", listed.GetProperty("reviewNote").GetString());
        Assert.Empty((await Factory.Client().GetFromJsonAsync<JsonElement>("/api/posts")).GetProperty("items").EnumerateArray());

        await SubmitAsync(writer); // slot freed
    }

    [Fact]
    public async Task Reject_note_over_500_chars_is_400()
    {
        var id = await SubmitAsync(await Factory.ContributorClientAsync());
        var owner = await Factory.AuthorClientAsync();
        var res = await owner.PostAsJsonAsync($"/api/admin/posts/{id}/reject", new { note = new string('x', 501) });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Approve_or_reject_non_pending_is_409_and_missing_is_404()
    {
        var published = await Factory.SeedPostAsync("Owner post");
        var owner = await Factory.AuthorClientAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsync($"/api/admin/posts/{published.Id}/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsJsonAsync($"/api/admin/posts/{published.Id}/reject", new { note = (string?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.PostAsync("/api/admin/posts/9999/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.PostAsJsonAsync("/api/admin/posts/9999/reject", new { note = (string?)null })).StatusCode);
    }

    [Fact]
    public async Task Contributor_resubmits_rejected_post()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        var owner = await Factory.AuthorClientAsync();
        await owner.PostAsJsonAsync($"/api/admin/posts/{id}/reject", new { note = "Too short" });
        await SubmitAsync(writer);
        await SubmitAsync(writer);

        // At 2/2 the rejected post can't come back yet.
        Assert.Equal(HttpStatusCode.Conflict, (await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input(body: "Longer"))).StatusCode);

        var other = (await writer.GetFromJsonAsync<JsonElement>("/api/admin/posts")).EnumerateArray()
            .First(p => p.GetProperty("status").GetString() == "Pending").GetProperty("id").GetInt32();
        await writer.DeleteAsync($"/api/admin/posts/{other}");

        var res = await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input(body: "Longer"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var post = await Json(res);
        Assert.Equal("Pending", post.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, (await writer.GetFromJsonAsync<JsonElement>($"/api/admin/posts/{id}")).GetProperty("reviewNote").ValueKind);
    }

    [Fact]
    public async Task Contributor_cannot_edit_or_delete_published_post()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        await (await Factory.AuthorClientAsync()).PostAsync($"/api/admin/posts/{id}/approve", null);
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.DeleteAsync($"/api/admin/posts/{id}")).StatusCode);
    }

    [Fact]
    public async Task Owner_saving_pending_as_published_approves_it_and_frees_slot()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        await SubmitAsync(writer);
        var owner = await Factory.AuthorClientAsync();

        var res = await owner.PutAsJsonAsync($"/api/admin/posts/{id}", Input(title: "Fixed typo", status: "Published"));
        Assert.Equal("Published", (await Json(res)).GetProperty("status").GetString());
        await SubmitAsync(writer);
    }

    [Fact]
    public async Task Owner_can_edit_pending_post_keeping_it_pending()
    {
        var id = await SubmitAsync(await Factory.ContributorClientAsync());
        var owner = await Factory.AuthorClientAsync();
        var res = await owner.PutAsJsonAsync($"/api/admin/posts/{id}", Input(title: "Typo fixed", status: "Pending"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("Pending", (await Json(res)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Owner_own_posts_publish_directly_and_cannot_be_made_pending()
    {
        var owner = await Factory.AuthorClientAsync();
        var res = await owner.PostAsJsonAsync("/api/admin/posts", Input(status: "Published"));
        Assert.Equal("Published", (await Json(res)).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync("/api/admin/posts", Input(status: "Pending"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync("/api/admin/posts", Input(status: "Rejected"))).StatusCode);
    }

    [Fact]
    public async Task Pending_count_is_for_the_owner_only()
    {
        var writer = await Factory.ContributorClientAsync();
        await SubmitAsync(writer);
        await SubmitAsync(writer);
        await Factory.SeedPostAsync("Owner draft", PostStatus.Draft);

        Assert.Equal(2, await (await Factory.AuthorClientAsync()).GetFromJsonAsync<int>("/api/admin/posts/pending-count"));
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.GetAsync("/api/admin/posts/pending-count")).StatusCode);
    }

    // ---------- US4: owner-only powers ----------

    [Fact]
    public async Task Contributor_cannot_approve_or_reject()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = await SubmitAsync(writer);
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.PostAsync($"/api/admin/posts/{id}/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.PostAsJsonAsync($"/api/admin/posts/{id}/reject", new { note = "x" })).StatusCode);
        Assert.Equal(1, await PendingCountAsync());
    }

    [Fact]
    public async Task Contributor_cannot_use_admin_comments()
    {
        var writer = await Factory.ContributorClientAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.GetAsync("/api/admin/comments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.DeleteAsync("/api/admin/comments/1")).StatusCode);
    }

    [Fact]
    public async Task Contributor_comment_has_no_author_badge_and_requires_name()
    {
        var post = await Factory.SeedPostAsync("Trip");
        var writer = await Factory.ContributorClientAsync();

        var res = await writer.PostAsJsonAsync($"/api/posts/{post.Slug}/comments", new { name = "Writer", body = "Nice" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.False((await Json(res)).GetProperty("isAuthor").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await writer.PostAsJsonAsync($"/api/posts/{post.Slug}/comments", new { name = "", body = "Nice" })).StatusCode);
    }

    [Fact]
    public async Task Removing_an_image_used_by_another_post_does_not_delete_it()
    {
        var ownerPost = await Factory.SeedPostAsync("Owner", images: 1);
        var shared = $"blog/Owner-1";
        var writer = await Factory.ContributorClientAsync();

        var created = await writer.PostAsJsonAsync("/api/admin/posts", Input(images: [Image(shared)]));
        var id = (await Json(created)).GetProperty("id").GetInt32();
        await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input(images: [Image("blog/mine")]));
        await writer.DeleteAsync($"/api/admin/posts/{id}");

        Assert.DoesNotContain(shared, Factory.Images.Deleted);
        Assert.Contains("blog/mine", Factory.Images.Deleted);
        await Factory.WithDbAsync(async db => Assert.True(await db.PostImages.AnyAsync(i => i.PostId == ownerPost.Id && i.PublicId == shared)));
    }
}
