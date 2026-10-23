using Blog.Api.Models;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Data;

public class BlogDbContext(DbContextOptions<BlogDbContext> options) : IdentityDbContext<Author>(options), IDataProtectionKeyContext
{
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<PostImage> PostImages => Set<PostImage>();
    public DbSet<Comment> Comments => Set<Comment>();
    // Keys that sign the login cookie; stored here so logins survive restarts and redeploys.
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<Post>(e =>
        {
            e.Property(p => p.Title).HasMaxLength(200);
            e.Property(p => p.Slug).HasMaxLength(80);
            e.Property(p => p.Excerpt).HasMaxLength(200);
            e.Property(p => p.Status).HasConversion<string>().HasMaxLength(16);
            e.HasIndex(p => p.Slug).IsUnique().HasFilter("\"Slug\" IS NOT NULL");
            e.HasIndex(p => new { p.Status, p.PublishedAt, p.Id }).IsDescending(false, true, true);
            e.Property(p => p.ReviewNote).HasMaxLength(Post.MaxReviewNoteLength);
            e.HasOne<Author>().WithMany().HasForeignKey(p => p.AuthorId).OnDelete(DeleteBehavior.Restrict);
            // The database caps pending posts per contributor: each holds slot 1 or 2.
            e.HasIndex(p => new { p.AuthorId, p.PendingSlot }).IsUnique().HasFilter("\"PendingSlot\" IS NOT NULL");
            e.HasMany(p => p.Images).WithOne().HasForeignKey(i => i.PostId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(p => p.Comments).WithOne().HasForeignKey(c => c.PostId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PostImage>(e =>
        {
            e.Property(i => i.PublicId).HasMaxLength(255);
            e.Property(i => i.AltText).HasMaxLength(300);
            e.Property(i => i.Format).HasMaxLength(10);
            e.HasIndex(i => new { i.PostId, i.Position }).IsUnique();
        });

        b.Entity<Comment>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(Comment.MaxNameLength);
            e.Property(c => c.Body).HasMaxLength(Comment.MaxBodyLength);
            e.HasIndex(c => new { c.PostId, c.Id });
        });
    }
}
