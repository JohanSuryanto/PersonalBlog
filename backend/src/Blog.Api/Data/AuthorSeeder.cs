using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Data;

public static class AuthorSeeder
{
    /// Creates the single author account from configuration if it does not exist yet.
    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var email = config["Author:Email"];
        var password = config["Author:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

        var users = scope.ServiceProvider.GetRequiredService<UserManager<Author>>();
        if (await users.FindByEmailAsync(email) is not null) return;

        var author = new Author
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            DisplayName = config["Author:DisplayName"] is { Length: > 0 } name ? name : email,
        };
        var result = await users.CreateAsync(author, password);
        if (!result.Succeeded)
            throw new InvalidOperationException("Could not create author: " + string.Join("; ", result.Errors.Select(e => e.Description)));
    }
}
