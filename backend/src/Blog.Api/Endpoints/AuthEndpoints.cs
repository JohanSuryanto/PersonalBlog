using System.Security.Claims;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Endpoints;

public record LoginRequest(string Email, string Password);
public record MeResponse(string Email, string DisplayName, bool IsOwner);
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
            if (result.Succeeded) return Results.Ok(await MeAsync(user, users));
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
                ? Results.Ok(await MeAsync(user, users))
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

        // Google came back: sign in an existing account, or create a contributor for a new verified email (spec 004, research R2).
        auth.MapGet("/google/done", async (HttpContext ctx, SignInManager<Author> signIn, UserManager<Author> users, IConfiguration config, ILogger<Author> log) =>
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
                    if (!verified || string.IsNullOrEmpty(email))
                    {
                        log.LogInformation("Google sign-in refused: {Reason}", "email_not_verified");
                        return Results.Redirect("/login?error=not-allowed");
                    }
                    var user = await users.FindByEmailAsync(email);
                    if (user is null && !config.GetValue("Contributors:SignupEnabled", true))
                    {
                        log.LogInformation("Google sign-in refused: {Reason}", "signup_disabled");
                        return Results.Redirect("/login?error=not-allowed");
                    }
                    if (user is null)
                    {
                        var name = info.Principal.FindFirstValue(ClaimTypes.Name)?.Trim();
                        if (string.IsNullOrEmpty(name)) name = email.Split('@')[0];
                        user = new Author { UserName = email, Email = email, EmailConfirmed = true, DisplayName = name[..Math.Min(name.Length, 100)] };
                        var created = await users.CreateAsync(user);
                        if (!created.Succeeded)
                        {
                            log.LogWarning("Could not create contributor: {Errors}", string.Join("; ", created.Errors.Select(e => e.Code)));
                            return Results.Redirect("/login?error=failed");
                        }
                    }
                    else if ((await users.GetLoginsAsync(user)).Any(l => l.LoginProvider == provider))
                    {
                        log.LogInformation("Google sign-in refused: {Reason}", "other_google_account_linked");
                        return Results.Redirect("/login?error=not-allowed");
                    }
                    if (!(await users.AddLoginAsync(user, new UserLoginInfo(provider, info.ProviderKey, provider))).Succeeded)
                        return Results.Redirect("/login?error=failed");
                }

                var result = await signIn.ExternalLoginSignInAsync(provider, info.ProviderKey, isPersistent: true);
                if (result.Succeeded) return Results.Redirect("/admin");
                // A blocked writer is locked out for good: say "not allowed", not "try again later".
                var blocked = result.IsLockedOut && await users.FindByLoginAsync(provider, info.ProviderKey) is { } u && WriterEndpoints.IsBlocked(u);
                log.LogInformation("Google sign-in refused: {Reason}", blocked ? "blocked" : result.IsLockedOut ? "locked_out" : "sign_in_not_allowed");
                return Results.Redirect(result.IsLockedOut && !blocked ? "/login?error=locked" : "/login?error=not-allowed");
            }
            finally
            {
                await ctx.SignOutAsync(IdentityConstants.ExternalScheme);
            }
        });
    }

    static async Task<MeResponse> MeAsync(Author user, UserManager<Author> users) =>
        new(user.Email!, user.DisplayName, await users.IsInRoleAsync(user, Roles.Owner));

    static async Task<bool> GoogleEnabledAsync(IAuthenticationSchemeProvider schemes) =>
        await schemes.GetSchemeAsync(GoogleDefaults.AuthenticationScheme) is not null;
}
