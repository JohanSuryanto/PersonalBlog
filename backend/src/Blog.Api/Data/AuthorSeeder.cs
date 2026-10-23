using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Data;

public static class AuthorSeeder
{
    /// Creates the owner account from configuration if it does not exist yet, and makes sure it has the Owner role.
    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var email = config["Author:Email"];
        var password = config["Author:Password"];
        if (string.IsNullOrWhiteSpace(email)) return;

        var users = scope.ServiceProvider.GetRequiredService<UserManager<Author>>();
        var author = await users.FindByEmailAsync(email);
        if (author is null)
        {
            if (string.IsNullOrWhiteSpace(password)) return;
            author = new Author
            {
                UserName = email,
                Email = email,
                EmailConfirmed = true,
                DisplayName = config["Author:DisplayName"] is { Length: > 0 } name ? name : email,
            };
            Check(await users.CreateAsync(author, password), "create author");
        }

        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        if (!await roles.RoleExistsAsync(Roles.Owner))
            Check(await roles.CreateAsync(new IdentityRole(Roles.Owner)), "create Owner role");
        if (!await users.IsInRoleAsync(author, Roles.Owner))
            Check(await users.AddToRoleAsync(author, Roles.Owner), "add author to Owner role");
    }

    static void Check(IdentityResult result, string what)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException($"Could not {what}: " + string.Join("; ", result.Errors.Select(e => e.Description)));
    }
}
