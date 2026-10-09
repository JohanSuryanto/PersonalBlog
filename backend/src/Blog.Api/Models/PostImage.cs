namespace Blog.Api.Models;

public class PostImage
{
    public const int MaxPerPost = 10;
    public const int MaxBytes = 10 * 1024 * 1024;
    public static readonly string[] AllowedFormats = ["jpg", "png", "webp", "gif"];

    public int Id { get; set; }
    public int PostId { get; set; }
    public required string PublicId { get; set; } // Cloudinary public_id
    public short Position { get; set; }           // 1–10, 1 = cover
    public string? AltText { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public required string Format { get; set; }
    public int Bytes { get; set; }
}
