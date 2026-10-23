using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Endpoints;

public record BlockedWriter(string Id, string DisplayName, string Email);

/// Owner-only: block a contributor (spam, abuse) or let them back in.
/// Blocking is an Identity lockout that never ends, so sign-in and existing sessions are refused by the standard checks.
public static class WriterEndpoints
{
    /// Lockouts at or after this date mean "blocked" rather than "too many failed attempts".
    public static readonly DateTimeOffset BlockedUntil = new(9999, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public static bool IsBlocked(Author user) => user.LockoutEnd >= BlockedUntil;

    public static void MapWriterEndpoints(this IEndpointRouteBuilder app)
    {
        var writers = app.MapGroup("/api/admin/writers").RequireAuthorization(Roles.Owner);

        writers.MapGet("/blocked", (BlogDbContext db) => db.Users.AsNoTracking()
            .Where(u => u.LockoutEnd >= BlockedUntil)
            .OrderBy(u => u.DisplayName)
            .Select(u => new BlockedWriter(u.Id, u.DisplayName, u.Email ?? ""))
            .ToListAsync());

        writers.MapPost("/{id}/block", async (string id, UserManager<Author> users, BlogDbContext db) =>
        {
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound();
            if (await users.IsInRoleAsync(user, Roles.Owner))
                return Results.Problem(statusCode: 400, title: "The owner can't be blocked.");

            await users.SetLockoutEnabledAsync(user, true);
            await users.SetLockoutEndDateAsync(user, BlockedUntil);
            await users.UpdateSecurityStampAsync(user); // ends their current sessions on the next request

            // Clear their queue: anything waiting is rejected (kept, not deleted, in case the block is undone).
            await db.Posts.Where(p => p.AuthorId == id && p.Status == PostStatus.Pending)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(p => p.Status, PostStatus.Rejected)
                    .SetProperty(p => p.PendingSlot, (short?)null)
                    .SetProperty(p => p.ReviewNote, "Writer blocked."));
            return Results.NoContent();
        });

        writers.MapPost("/{id}/unblock", async (string id, UserManager<Author> users) =>
        {
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound();
            await users.SetLockoutEndDateAsync(user, null);
            await users.ResetAccessFailedCountAsync(user);
            return Results.NoContent();
        });
    }
}
