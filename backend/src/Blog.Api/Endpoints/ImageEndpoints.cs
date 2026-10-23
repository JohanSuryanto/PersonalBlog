namespace Blog.Api.Endpoints;

public static class ImageEndpoints
{
    /// Contributors get a daily number of uploads (one per signature); the owner is not limited.
    public const string RateLimitPolicy = "image-uploads";

    public static void MapImageEndpoints(this IEndpointRouteBuilder app) =>
        app.MapPost("/api/images/signature", (ImageStore images) => images.CreateUploadSignature())
            .RequireAuthorization()
            .RequireRateLimiting(RateLimitPolicy);
}
