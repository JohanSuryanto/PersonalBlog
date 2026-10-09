using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Blog.Api.Tests;

public class AuthTests(BlogApiFactory factory) : ApiTest(factory)
{
    [Fact]
    public async Task Login_sets_cookie_and_me_returns_author()
    {
        var client = await Factory.AuthorClientAsync();
        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(BlogApiFactory.AuthorEmail, me.GetProperty("email").GetString());
        Assert.Equal("Test Author", me.GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task Wrong_password_is_401()
    {
        var res = await Factory.Client().PostAsJsonAsync("/api/auth/login", new { email = BlogApiFactory.AuthorEmail, password = "nope" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Five_failures_lock_the_account()
    {
        var client = Factory.Client();
        for (var i = 0; i < 5; i++)
            await client.PostAsJsonAsync("/api/auth/login", new { email = BlogApiFactory.AuthorEmail, password = "nope" });

        var res = await client.PostAsJsonAsync("/api/auth/login",
            new { email = BlogApiFactory.AuthorEmail, password = BlogApiFactory.AuthorPassword });
        Assert.Equal((HttpStatusCode)423, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("retryAfterSeconds").GetInt32() > 0);
    }

    [Fact]
    public async Task Logout_ends_the_session()
    {
        var client = await Factory.AuthorClientAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Me_is_401_when_anonymous() =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await Factory.Client().GetAsync("/api/auth/me")).StatusCode);

    [Fact]
    public async Task There_is_no_registration_endpoint()
    {
        var res = await Factory.Client().PostAsJsonAsync("/api/auth/register", new { email = "x@y.z", password = "Password-123" });
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
