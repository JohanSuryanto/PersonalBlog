using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Blog.Api.Tests;

public class ImageSignatureTests(BlogApiFactory factory) : ApiTest(factory)
{
    [Fact]
    public async Task Anonymous_is_401() =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await Factory.Client().PostAsync("/api/images/signature", null)).StatusCode);

    [Fact]
    public async Task Author_gets_signature_without_secret()
    {
        var author = await Factory.AuthorClientAsync();
        var sig = await (await author.PostAsync("/api/images/signature", null)).Content.ReadFromJsonAsync<JsonElement>();

        foreach (var field in new[] { "cloudName", "apiKey", "timestamp", "folder", "allowedFormats", "publicId", "signature" })
            Assert.True(sig.TryGetProperty(field, out _), field);
        Assert.False(sig.TryGetProperty("apiSecret", out _));
    }

    [Fact]
    public void Real_signature_matches_cloudinary_algorithm()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cloudinary:CloudName"] = "demo", ["Cloudinary:ApiKey"] = "key", ["Cloudinary:ApiSecret"] = "secret",
        }).Build();
        var sig = new ImageStore(config, Microsoft.Extensions.Logging.Abstractions.NullLogger<ImageStore>.Instance).CreateUploadSignature();

        // Cloudinary: sha1 of sorted "k=v&k=v" params + api secret.
        var toSign = $"allowed_formats={sig.AllowedFormats}&folder={sig.Folder}&overwrite=false&public_id={sig.PublicId}&timestamp={sig.Timestamp}secret";
        var expected = Convert.ToHexStringLower(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(toSign)));
        Assert.Equal(expected, sig.Signature);
    }
}
