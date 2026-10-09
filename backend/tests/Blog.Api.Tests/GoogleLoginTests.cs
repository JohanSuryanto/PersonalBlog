using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Tests;

public class GoogleLoginTests(BlogApiFactory factory) : ApiTest(factory)
{
    const string Author = BlogApiFactory.AuthorEmail;

    async Task<HttpResponseMessage> DoneAsync(HttpClient client) => await client.GetAsync("/api/auth/google/done");

    async Task<(int Users, List<string> Links)> CountsAsync()
    {
        var users = 0;
        List<string> links = [];
        await Factory.WithDbAsync(async db =>
        {
            users = await db.Users.CountAsync();
            links = await db.UserLogins.Where(l => l.LoginProvider == "Google").Select(l => l.ProviderKey).ToListAsync();
        });
        return (users, links);
    }

    async Task AssertRefusedAsync(HttpClient client, string error = "not-allowed")
    {
        var res = await DoneAsync(client);
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        Assert.Equal($"/login?error={error}", res.Headers.Location?.OriginalString);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(1, (await CountsAsync()).Users);
    }

    async Task LinkAuthorAsync(string sub = "sub-1")
    {
        var res = await DoneAsync(await Factory.GoogleClientAsync(sub, Author));
        Assert.Equal("/admin", res.Headers.Location?.OriginalString);
    }

    // US1

    [Fact]
    public async Task Google_challenge_redirects_to_Google_with_state_and_pkce()
    {
        var res = await Factory.Client(followRedirects: false).GetAsync("/api/auth/google");
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        var location = res.Headers.Location!.ToString();
        Assert.StartsWith("https://accounts.google.com/o/oauth2/v2/auth", location);
        Assert.Contains("client_id=test-client-id", location);
        Assert.Contains("state=", location);
        Assert.Contains("code_challenge=", location);
        Assert.Contains("code_challenge_method=S256", location);
        Assert.Contains("redirect_uri=https%3A%2F%2Flocalhost%2Fapi%2Fauth%2Fsignin-google", location);
    }

    [Fact]
    public async Task First_sign_in_with_verified_author_email_links_and_signs_in()
    {
        var client = await Factory.GoogleClientAsync("sub-1", Author);
        var res = await DoneAsync(client);
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        Assert.Equal("/admin", res.Headers.Location?.OriginalString);

        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(Author, me.GetProperty("email").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/posts")).StatusCode);

        var (users, links) = await CountsAsync();
        Assert.Equal(1, users);
        Assert.Equal(["sub-1"], links);
    }

    [Fact]
    public async Task Email_match_ignores_case()
    {
        var res = await DoneAsync(await Factory.GoogleClientAsync("sub-1", Author.ToUpperInvariant()));
        Assert.Equal("/admin", res.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Linked_account_is_found_by_google_id_even_after_email_change()
    {
        await LinkAuthorAsync();
        var client = await Factory.GoogleClientAsync("sub-1", "changed@example.com");
        Assert.Equal("/admin", (await DoneAsync(client)).Headers.Location?.OriginalString);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Logout_ends_a_google_session()
    {
        var client = await Factory.GoogleClientAsync("sub-1", Author);
        await DoneAsync(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Providers_reports_google_enabled() =>
        Assert.True((await Factory.Client().GetFromJsonAsync<JsonElement>("/api/auth/providers")).GetProperty("google").GetBoolean());

    // US2

    [Fact]
    public async Task Unknown_email_is_refused_and_creates_nothing()
    {
        await AssertRefusedAsync(await Factory.GoogleClientAsync("sub-x", "stranger@example.com"));
        Assert.Empty((await CountsAsync()).Links);
    }

    [Fact]
    public async Task Unverified_author_email_is_refused() =>
        await AssertRefusedAsync(await Factory.GoogleClientAsync("sub-1", Author, verified: false));

    [Fact]
    public async Task Missing_verified_flag_is_refused()
    {
        await AssertRefusedAsync(await Factory.GoogleClientAsync("sub-1", Author, verified: null));
        Assert.Empty((await CountsAsync()).Links);
    }

    [Fact]
    public async Task Second_google_account_with_author_email_is_refused()
    {
        await LinkAuthorAsync("sub-1");
        await AssertRefusedAsync(await Factory.GoogleClientAsync("sub-2", Author));
        Assert.Equal(["sub-1"], (await CountsAsync()).Links);
    }

    [Fact]
    public async Task Locked_out_author_is_refused()
    {
        await LinkAuthorAsync();
        await Factory.WithDbAsync(db => db.Users.ExecuteUpdateAsync(u => u.SetProperty(x => x.LockoutEnd, DateTimeOffset.UtcNow.AddMinutes(15))));
        await AssertRefusedAsync(await Factory.GoogleClientAsync("sub-1", Author), "locked");
    }

    [Fact]
    public async Task Done_without_google_return_is_failed()
    {
        var res = await DoneAsync(Factory.Client(followRedirects: false));
        Assert.Equal("/login?error=failed", res.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Without_google_config_the_option_is_off()
    {
        await using var app = Factory.WithWebHostBuilder(b => b.UseSetting("Authentication:Google:ClientId", ""));
        var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        Assert.False((await client.GetFromJsonAsync<JsonElement>("/api/auth/providers")).GetProperty("google").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/auth/google")).StatusCode);
    }

    // US3

    [Fact]
    public async Task Password_login_still_works_after_linking_google()
    {
        await LinkAuthorAsync();
        var client = Factory.Client();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { email = Author, password = BlogApiFactory.AuthorPassword });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }
}
