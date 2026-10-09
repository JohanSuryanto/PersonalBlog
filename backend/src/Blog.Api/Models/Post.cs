namespace Blog.Api.Models;

public enum PostStatus { Draft, Published }

public class Post
{
    public int Id { get; set; }
    public required string Title { get; set; }   // 1–200 chars, trimmed
    public string? Slug { get; set; }            // assigned on first publish, never changed after
    public required string Body { get; set; }    // Markdown
    public string Excerpt { get; set; } = "";    // derived on save
    public PostStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; } // set on publish, cleared on unpublish
    public List<PostImage> Images { get; set; } = [];
    public List<Comment> Comments { get; set; } = [];
}
