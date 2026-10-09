using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Endpoints;

public record LoginRequest(string Email, string Password);
public record MeResponse(string Email, string DisplayName);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth");

        auth.MapPost("/login", async (LoginRequest req, SignInManager<Author> signIn, UserManager<Author> users) =>
        {
            var user = await users.FindByEmailAsync(req.Email ?? "");
            if (user is null) return Results.Problem(statusCode: 401, title: "Invalid email or password.");

            var result = await signIn.PasswordSignInAsync(user, req.Password ?? "", isPersistent: true, lockoutOnFailure: true);
            if (result.Succeeded) return Results.Ok(new MeResponse(user.Email!, user.DisplayName));
            if (result.IsLockedOut)
            {
                var end = await users.GetLockoutEndDateAsync(user) ?? DateTimeOffset.UtcNow;
                var seconds = (int)Math.Ceiling(Math.Max(0, (end - DateTimeOffset.UtcNow).TotalSeconds));
                return Results.Problem(statusCode: 423, title: "Account temporarily locked.",
                    extensions: new Dictionary<string, object?> { ["retryAfterSeconds"] = seconds });
            }
            return Results.Problem(statusCode: 401, title: "Invalid email or password.");
        });

        auth.MapPost("/logout", async (SignInManager<Author> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        });

        auth.MapGet("/me", async (HttpContext ctx, UserManager<Author> users) =>
            await users.GetUserAsync(ctx.User) is { } user
                ? Results.Ok(new MeResponse(user.Email!, user.DisplayName))
                : Results.Unauthorized());
    }
}
