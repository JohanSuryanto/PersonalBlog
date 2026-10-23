using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using static Blog.Api.Tests.AdminPostTests;

namespace Blog.Api.Tests;

/// Brakes on open sign-up: blocking writers, switching sign-up off, and a daily upload limit.
public class WriterSafetyTests(BlogApiFactory factory) : ApiTest(factory)
{
    static async Task<JsonElement> Json(HttpResponseMessage res) => await res.Content.ReadFromJsonAsync<JsonElement>();

    /// Google sign-in against a customised copy of the app; returns the client and where /google/done sent it.
    static async Task<(HttpClient Client, string? Location)> GoogleSignInAsync(WebApplicationFactory<Program> app, string sub, string email)
    {
        var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        (await client.GetAsync($"/test/external-login?sub={sub}&email={Uri.EscapeDataString(email)}&verified=true")).EnsureSuccessStatusCode();
        var res = await client.GetAsync("/api/auth/google/done");
        return (client, res.Headers.Location?.OriginalString);
    }

    // ---------- Blocking ----------

    [Fact]
    public async Task Owner_blocks_writer_ending_session_rejecting_queue_and_refusing_sign_in()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = (await Json(await writer.PostAsJsonAsync("/api/admin/posts", Input()))).GetProperty("id").GetInt32();
        var writerId = await Factory.UserIdAsync("writer@example.com");
        var owner = await Factory.AuthorClientAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/admin/writers/{writerId}/block", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await writer.GetAsync("/api/admin/posts")).StatusCode);
        var post = await owner.GetFromJsonAsync<JsonElement>($"/api/admin/posts/{id}");
        Assert.Equal("Rejected", post.GetProperty("status").GetString());
        Assert.Equal("Writer blocked.", post.GetProperty("reviewNote").GetString());

        var again = await Factory.GoogleClientAsync("sub-c1", "writer@example.com");
        Assert.Equal("/login?error=not-allowed", (await again.GetAsync("/api/auth/google/done")).Headers.Location?.OriginalString);

        var blocked = await owner.GetFromJsonAsync<JsonElement>("/api/admin/writers/blocked");
        Assert.Equal("Writer", Assert.Single(blocked.EnumerateArray()).GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task Unblocked_writer_can_sign_in_again()
    {
        await Factory.ContributorClientAsync();
        var writerId = await Factory.UserIdAsync("writer@example.com");
        var owner = await Factory.AuthorClientAsync();
        await owner.PostAsync($"/api/admin/writers/{writerId}/block", null);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/admin/writers/{writerId}/unblock", null)).StatusCode);
        await Factory.ContributorClientAsync(); // throws unless sign-in lands on /admin
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement>("/api/admin/writers/blocked")).EnumerateArray());
    }

    [Fact]
    public async Task Owner_cannot_be_blocked_and_writers_cannot_block()
    {
        var owner = await Factory.AuthorClientAsync();
        var ownerId = await Factory.UserIdAsync(BlogApiFactory.AuthorEmail);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/admin/writers/{ownerId}/block", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.PostAsync("/api/admin/writers/nobody/block", null)).StatusCode);

        var writer = await Factory.ContributorClientAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.PostAsync($"/api/admin/writers/{ownerId}/block", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await writer.GetAsync("/api/admin/writers/blocked")).StatusCode);
    }

    // ---------- Sign-up switch ----------

    [Fact]
    public async Task With_signup_off_new_writers_are_refused_but_existing_ones_still_sign_in()
    {
        await Factory.ContributorClientAsync(); // existing writer, created while sign-up was on
        await using var app = Factory.WithWebHostBuilder(b => b.UseSetting("Contributors:SignupEnabled", "false"));

        Assert.Equal("/login?error=not-allowed", (await GoogleSignInAsync(app, "sub-new", "new@example.com")).Location);
        Assert.Equal("/admin", (await GoogleSignInAsync(app, "sub-c1", "writer@example.com")).Location);
        Assert.Equal("/admin", (await GoogleSignInAsync(app, "sub-owner", BlogApiFactory.AuthorEmail)).Location);
        await Factory.WithDbAsync(async db => Assert.False(await db.Users.AnyAsync(u => u.Email == "new@example.com")));
    }

    // ---------- Upload limit ----------

    [Fact]
    public async Task Writers_get_a_daily_upload_limit_and_the_owner_does_not()
    {
        await using var app = Factory.WithWebHostBuilder(b => b.UseSetting("Images:ContributorUploadsPerDay", "2"));
        var (writer, _) = await GoogleSignInAsync(app, "sub-limit", "limit@example.com");

        var ids = new List<string>();
        for (var i = 0; i < 2; i++)
        {
            var res = await writer.PostAsync("/api/images/signature", null);
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            ids.Add((await Json(res)).GetProperty("publicId").GetString()!);
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await writer.PostAsync("/api/images/signature", null)).StatusCode);
        Assert.NotEqual(ids[0], ids[1]); // each signature is for one new image

        var owner = app.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        (await owner.PostAsJsonAsync("/api/auth/login", new { email = BlogApiFactory.AuthorEmail, password = BlogApiFactory.AuthorPassword })).EnsureSuccessStatusCode();
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync("/api/images/signature", null)).StatusCode);
    }

    // ---------- Profile count and submit time ----------

    [Fact]
    public async Task Profile_counts_only_the_owners_published_posts()
    {
        await Factory.SeedPostAsync("Owner post");
        var writer = await Factory.ContributorClientAsync();
        var id = (await Json(await writer.PostAsJsonAsync("/api/admin/posts", Input()))).GetProperty("id").GetInt32();
        await (await Factory.AuthorClientAsync()).PostAsync($"/api/admin/posts/{id}/approve", null);

        var anon = Factory.Client();
        Assert.Equal(2, (await anon.GetFromJsonAsync<JsonElement>("/api/posts")).GetProperty("items").GetArrayLength());
        Assert.Equal(1, (await anon.GetFromJsonAsync<JsonElement>("/api/profile")).GetProperty("postCount").GetInt32());
    }

    [Fact]
    public async Task Submitted_time_is_set_on_submit_kept_on_edit_and_renewed_on_resubmit()
    {
        var writer = await Factory.ContributorClientAsync();
        var id = (await Json(await writer.PostAsJsonAsync("/api/admin/posts", Input()))).GetProperty("id").GetInt32();
        async Task<DateTimeOffset?> SubmittedAsync()
        {
            DateTimeOffset? at = null;
            await Factory.WithDbAsync(async db => at = await db.Posts.Where(p => p.Id == id).Select(p => p.SubmittedAt).SingleAsync());
            return at;
        }

        var first = await SubmittedAsync();
        Assert.NotNull(first);
        await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input(title: "Edited"));
        Assert.Equal(first, await SubmittedAsync());

        var listed = (await (await Factory.AuthorClientAsync()).GetFromJsonAsync<JsonElement>("/api/admin/posts")).EnumerateArray().Single();
        Assert.NotEqual(JsonValueKind.Null, listed.GetProperty("submittedAt").ValueKind);

        await (await Factory.AuthorClientAsync()).PostAsJsonAsync($"/api/admin/posts/{id}/reject", new { note = "x" });
        await writer.PutAsJsonAsync($"/api/admin/posts/{id}", Input(title: "Resubmitted"));
        Assert.True(await SubmittedAsync() > first);
    }
}
