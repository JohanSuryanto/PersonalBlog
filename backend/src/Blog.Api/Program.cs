using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Blog.Api;
using Blog.Api.Data;
using Blog.Api.Endpoints;
using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<BlogDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Blog"), npgsql => npgsql.EnableRetryOnFailure()));

builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies();
builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "blog_auth";
    o.Cookie.HttpOnly = true;
    o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.ExpireTimeSpan = TimeSpan.FromDays(14);
    o.SlidingExpiration = true;
    // API: respond with status codes instead of redirecting to a login page.
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddIdentityCore<Author>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        o.Lockout.AllowedForNewUsers = true;
    })
    .AddEntityFrameworkStores<BlogDbContext>()
    .AddSignInManager();

builder.Services.AddRateLimiter(o =>
{
    // ponytail: in-memory counters, per instance and reset on restart; use a shared store if the API is scaled out
    o.AddPolicy(CommentEndpoints.RateLimitPolicy, ctx =>
    {
        var config = ctx.RequestServices.GetRequiredService<IConfiguration>();
        return RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new()
        {
            PermitLimit = config.GetValue("Comments:RateLimit:PermitLimit", 5),
            Window = TimeSpan.FromMinutes(config.GetValue("Comments:RateLimit:WindowMinutes", 10)),
            QueueLimit = 0,
        });
    });
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, _) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retry.TotalSeconds)).ToString();
        return ValueTask.CompletedTask;
    };
});
builder.Services.AddSingleton<ImageStore>();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapAuthEndpoints();
app.MapPostEndpoints();
app.MapAdminPostEndpoints();
app.MapImageEndpoints();
app.MapCommentEndpoints();

await AuthorSeeder.SeedAsync(app.Services);

app.Run();

public partial class Program;
