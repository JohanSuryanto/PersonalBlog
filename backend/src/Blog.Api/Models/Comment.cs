namespace Blog.Api.Models;

public class Comment
{
    public const int MaxNameLength = 50;
    public const int MaxBodyLength = 2000;

    public int Id { get; set; }                  // identity: increases in posting order, used as the paging key
    public int PostId { get; set; }
    public required string Name { get; set; }    // 1–50 chars, trimmed
    public required string Body { get; set; }    // 1–2,000 chars, trimmed, plain text
    public bool IsAuthor { get; set; }           // set by the server only
    public DateTimeOffset CreatedAt { get; set; }
}
