using CloudinaryDotNet;
using CloudinaryDotNet.Actions;

namespace Blog.Api;

public record UploadSignature(string CloudName, string ApiKey, long Timestamp, string Folder, string AllowedFormats, string PublicId, string Signature);

/// Thin wrapper over Cloudinary. Methods are virtual so tests can substitute a fake.
public class ImageStore(IConfiguration config, ILogger<ImageStore> logger)
{
    const string AllowedFormats = "jpg,png,webp,gif";

    readonly Lazy<Cloudinary> _cloudinary = new(() => new Cloudinary(new Account(
        config["Cloudinary:CloudName"], config["Cloudinary:ApiKey"], config["Cloudinary:ApiSecret"])));

    string Folder => config["Cloudinary:Folder"] ?? "blog";

    public virtual UploadSignature CreateUploadSignature()
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var publicId = Guid.NewGuid().ToString("N");
        var parameters = new SortedDictionary<string, object>
        {
            ["allowed_formats"] = AllowedFormats,
            ["folder"] = Folder,
            // A fixed, unique name: one signature can create one image at most (re-sending it can't add more).
            ["overwrite"] = "false",
            ["public_id"] = publicId,
            ["timestamp"] = timestamp,
        };
        var signature = _cloudinary.Value.Api.SignParameters(new Dictionary<string, object>(parameters));
        return new UploadSignature(config["Cloudinary:CloudName"]!, config["Cloudinary:ApiKey"]!, timestamp, Folder, AllowedFormats, publicId, signature);
    }

    /// Best effort: failures are logged, never thrown, so a post save/delete is not blocked by Cloudinary.
    public virtual async Task DeleteAsync(IEnumerable<string> publicIds)
    {
        foreach (var id in publicIds)
        {
            try
            {
                var result = await _cloudinary.Value.DestroyAsync(new DeletionParams(id));
                if (result.Error is not null) logger.LogWarning("Cloudinary delete failed for {PublicId}: {Error}", id, result.Error.Message);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Cloudinary delete failed for {PublicId}", id);
            }
        }
    }
}
