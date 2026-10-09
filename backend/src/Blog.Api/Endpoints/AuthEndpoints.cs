using System.Security.Claims;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Endpoints;

public record LoginRequest(string Email, string Password);
public record MeResponse(string Email, string DisplayName);
public record ProvidersResponse(bool Google);

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

        auth.MapGet("/providers", async (IAuthenticationSchemeProvider schemes) =>
            Results.Ok(new ProvidersResponse(await GoogleEnabledAsync(schemes))));

        // Browser navigation: starts Google sign-in. Fixed return address, so no open redirect.
        auth.MapGet("/google", async (IAuthenticationSchemeProvider schemes) =>
            await GoogleEnabledAsync(schemes)
                ? Results.Challenge(new AuthenticationProperties
                    {
                        RedirectUri = "/api/auth/google/done",
                        Items = { ["LoginProvider"] = GoogleDefaults.AuthenticationScheme },
                    }, [GoogleDefaults.AuthenticationScheme])
                : Results.NotFound());

        // Google came back: sign in only an existing author, never create one (spec 003, research R4).
        auth.MapGet("/google/done", async (HttpContext ctx, SignInManager<Author> signIn, UserManager<Author> users, ILogger<Author> log) =>
        {
            try
            {
                var info = await signIn.GetExternalLoginInfoAsync();
                if (info is null) return Results.Redirect("/login?error=failed");

                var provider = GoogleDefaults.AuthenticationScheme;
                if (await users.FindByLoginAsync(provider, info.ProviderKey) is null)
                {
                    // First use: link by Google-verified email, and only if this author has no Google account yet.
                    var email = info.Principal.FindFirstValue(ClaimTypes.Email);
                    var verified = string.Equals(info.Principal.FindFirstValue("email_verified"), "true", StringComparison.OrdinalIgnoreCase);
                    var user = verified && !string.IsNullOrEmpty(email) ? await users.FindByEmailAsync(email) : null;
                    if (user is null)
                    {
                        log.LogInformation("Google sign-in refused: {Reason}", verified ? "no_matching_account" : "email_not_verified");
                        return Results.Redirect("/login?error=not-allowed");
                    }
                    if ((await users.GetLoginsAsync(user)).Any(l => l.LoginProvider == provider))
                    {
                        log.LogInformation("Google sign-in refused: {Reason}", "other_google_account_linked");
                        return Results.Redirect("/login?error=not-allowed");
                    }
                    if (!(await users.AddLoginAsync(user, new UserLoginInfo(provider, info.ProviderKey, provider))).Succeeded)
                        return Results.Redirect("/login?error=failed");
                }

                var result = await signIn.ExternalLoginSignInAsync(provider, info.ProviderKey, isPersistent: true);
                if (result.Succeeded) return Results.Redirect("/admin");
                log.LogInformation("Google sign-in refused: {Reason}", result.IsLockedOut ? "locked_out" : "sign_in_not_allowed");
                return Results.Redirect(result.IsLockedOut ? "/login?error=locked" : "/login?error=not-allowed");
            }
            finally
            {
                await ctx.SignOutAsync(IdentityConstants.ExternalScheme);
            }
        });
    }

    static async Task<bool> GoogleEnabledAsync(IAuthenticationSchemeProvider schemes) =>
        await schemes.GetSchemeAsync(GoogleDefaults.AuthenticationScheme) is not null;
}
