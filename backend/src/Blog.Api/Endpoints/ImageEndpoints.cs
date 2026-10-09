namespace Blog.Api.Endpoints;

public static class ImageEndpoints
{
    public static void MapImageEndpoints(this IEndpointRouteBuilder app) =>
        app.MapPost("/api/images/signature", (ImageStore images) => images.CreateUploadSignature()).RequireAuthorization();
}
