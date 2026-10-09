using System.Net.Http.Json;
using Blog.Api;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Hosting;
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
        new("demo", "key", 1, "blog", "jpg,png,webp,gif", "sig");

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
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<ImageStore>();
            s.AddSingleton<ImageStore>(Images);
        });
    }

    /// Cookies require HTTPS (Secure flag), so tests talk to https://localhost.
    public HttpClient Client() => CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

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
            await db.Database.ExecuteSqlRawAsync("TRUNCATE \"Comments\", \"PostImages\", \"Posts\" RESTART IDENTITY CASCADE");
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
        string? body = null, int images = 0)
    {
        var now = DateTimeOffset.UtcNow;
        var post = new Post
        {
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

/// Base class: shares one factory per test class and resets data before each test.
public abstract class ApiTest(BlogApiFactory factory) : IClassFixture<BlogApiFactory>, IAsyncLifetime
{
    protected BlogApiFactory Factory { get; } = factory;
    public ValueTask InitializeAsync() => new(Factory.ResetAsync());
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
