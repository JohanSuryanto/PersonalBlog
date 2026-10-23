namespace Blog.Api.Models;

public enum PostStatus { Draft, Published, Pending, Rejected }

public class Post
{
    public const int MaxPendingPerContributor = 2;
    public const int MaxReviewNoteLength = 500;

    public int Id { get; set; }
    public required string Title { get; set; }   // 1–200 chars, trimmed
    public string? Slug { get; set; }            // assigned on first publish, never changed after
    public required string Body { get; set; }    // Markdown
    public string Excerpt { get; set; } = "";    // derived on save
    public PostStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; } // set on publish, cleared on unpublish
    public string AuthorId { get; set; } = "";       // writer, FK to AspNetUsers
    public short? PendingSlot { get; set; }          // 1 or 2 while Pending, else null (research R3)
    public string? ReviewNote { get; set; }          // owner's note on reject; max 500
    public DateTimeOffset? SubmittedAt { get; set; } // last time a contributor sent it for approval
    public List<PostImage> Images { get; set; } = [];
    public List<Comment> Comments { get; set; } = [];
}
