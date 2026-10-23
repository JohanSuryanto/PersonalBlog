using System.Net.Http.Json;
using System.Security.Claims;
using Blog.Api;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.PostgreSql;

namespace Blog.Api.Tests;

public class FakeImageStore() : ImageStore(new ConfigurationBuilder().Build(), NullLogger<ImageStore>.Instance)
{
    public List<string> Deleted { get; } = [];

    public override UploadSignature CreateUploadSignature() =>
        new("demo", "key", 1, "blog", "jpg,png,webp,gif", Guid.NewGuid().ToString("N"), "sig");

    public override Task DeleteAsync(IEnumerable<string> publicIds)
    {
        lock (Deleted) Deleted.AddRange(publicIds);
        return Task.CompletedTask;
    }
}

/// One Postgres container per test class; each test gets a fresh database state via ResetAsync.
public class BlogApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AuthorEmail = "author@example.com";
    public const string AuthorPassword = "Test-Password-123";

    readonly PostgreSqlContainer _db = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public FakeImageStore Images { get; } = new();

    public async ValueTask InitializeAsync()
    {
        await _db.StartAsync();
        await using var ctx = new BlogDbContext(new DbContextOptionsBuilder<BlogDbContext>().UseNpgsql(_db.GetConnectionString()).Options);
        await ctx.Database.MigrateAsync();
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _db.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Blog", _db.GetConnectionString());
        builder.UseSetting("Author:Email", AuthorEmail);
        builder.UseSetting("Author:Password", AuthorPassword);
        builder.UseSetting("Author:DisplayName", "Test Author");
        builder.UseSetting("Comments:RateLimit:PermitLimit", "1000"); // all test requests share one address
        builder.UseSetting("Authentication:Google:ClientId", "test-client-id");
        builder.UseSetting("Authentication:Google:ClientSecret", "test-secret");
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<ImageStore>();
            s.AddSingleton<ImageStore>(Images);
            s.AddSingleton<IStartupFilter, FakeGoogleReturn>();
        });
    }

    /// Cookies require HTTPS (Secure flag), so tests talk to https://localhost.
    public HttpClient Client(bool followRedirects = true) => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        AllowAutoRedirect = followRedirects,
    });

    /// A client that has just "come back from Google" with these claims (see FakeGoogleReturn); redirects not followed.
    public async Task<HttpClient> GoogleClientAsync(string sub, string? email, bool? verified = true, string? name = null)
    {
        var client = Client(followRedirects: false);
        var query = $"?sub={Uri.EscapeDataString(sub)}&email={Uri.EscapeDataString(email ?? "")}&verified={verified?.ToString().ToLowerInvariant()}"
            + $"&name={Uri.EscapeDataString(name ?? "")}";
        (await client.GetAsync("/test/external-login" + query)).EnsureSuccessStatusCode();
        return client;
    }

    /// A signed-in contributor: a new Google account, created on first sign-in (spec 004).
    public async Task<HttpClient> ContributorClientAsync(string sub = "sub-c1", string email = "writer@example.com", string? name = "Writer")
    {
        var client = await GoogleClientAsync(sub, email, name: name);
        var res = await client.GetAsync("/api/auth/google/done");
        if (res.Headers.Location?.OriginalString != "/admin")
            throw new InvalidOperationException($"Contributor sign-in failed: {(int)res.StatusCode} {res.Headers.Location}");
        return client;
    }

    public async Task<string> UserIdAsync(string email)
    {
        var id = "";
        await WithDbAsync(async db => id = await db.Users.Where(u => u.Email == email).Select(u => u.Id).SingleAsync());
        return id;
    }

    public async Task<HttpClient> AuthorClientAsync()
    {
        var client = Client();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { email = AuthorEmail, password = AuthorPassword });
        res.EnsureSuccessStatusCode();
        return client;
    }

    public async Task ResetAsync()
    {
        await WithDbAsync(async db =>
        {
            await db.Database.ExecuteSqlRawAsync("TRUNCATE \"Comments\", \"PostImages\", \"Posts\", \"AspNetUserLogins\" RESTART IDENTITY CASCADE");
            await db.Users.Where(u => u.Email != AuthorEmail).ExecuteDeleteAsync();
            await db.Users.ExecuteUpdateAsync(u => u.SetProperty(x => x.AccessFailedCount, 0).SetProperty(x => x.LockoutEnd, (DateTimeOffset?)null));
        });
        lock (Images.Deleted) Images.Deleted.Clear();
    }

    public async Task WithDbAsync(Func<BlogDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<BlogDbContext>());
    }

    public async Task<Post> SeedPostAsync(string title, PostStatus status = PostStatus.Published, DateTimeOffset? publishedAt = null,
        string? body = null, int images = 0, string? authorId = null)
    {
        var now = DateTimeOffset.UtcNow;
        var post = new Post
        {
            AuthorId = authorId ?? await UserIdAsync(AuthorEmail),
            Title = title,
            Body = body ?? $"Body of {title}",
            Excerpt = body ?? $"Body of {title}",
            Status = status,
            Slug = status == PostStatus.Published ? Text.Slugify(title) + "-" + Guid.NewGuid().ToString("N")[..6] : null,
            CreatedAt = now,
            UpdatedAt = now,
            PublishedAt = status == PostStatus.Published ? publishedAt ?? now : null,
            Images = Enumerable.Range(1, images).Select(i => new PostImage
            {
                PublicId = $"blog/{title}-{i}", Position = (short)i, Width = 800, Height = 600, Format = "jpg", Bytes = 1000,
            }).ToList(),
        };
        await WithDbAsync(async db => { db.Posts.Add(post); await db.SaveChangesAsync(); });
        return post;
    }
}

/// Stands in for Google's return: signs in to Identity's external cookie the way the Google handler would,
/// so /api/auth/google/done can be tested without reaching Google.
class FakeGoogleReturn : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        // Not app.Map: that would scope the cookie's path to /test/external-login.
        app.Use(async (ctx, nextMiddleware) =>
        {
            if (ctx.Request.Path != "/test/external-login") { await nextMiddleware(); return; }
            var q = ctx.Request.Query;
            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, q["sub"]!) };
            if (q["email"] is { Count: > 0 } email && email != "") claims.Add(new(ClaimTypes.Email, email!));
            if (q["verified"] is { Count: > 0 } verified && verified != "") claims.Add(new("email_verified", verified!));
            if (q["name"] is { Count: > 0 } name && name != "") claims.Add(new(ClaimTypes.Name, name!));
            var props = new AuthenticationProperties { Items = { ["LoginProvider"] = "Google" } };
            await ctx.SignInAsync(IdentityConstants.ExternalScheme, new ClaimsPrincipal(new ClaimsIdentity(claims, "Google")), props);
            ctx.Response.StatusCode = StatusCodes.Status204NoContent;
        });
        next(app);
    };
}

/// Base class: shares one factory per test class and resets data before each test.
public abstract class ApiTest(BlogApiFactory factory) : IClassFixture<BlogApiFactory>, IAsyncLifetime
{
    protected BlogApiFactory Factory { get; } = factory;
    public ValueTask InitializeAsync() => new(Factory.ResetAsync());
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
