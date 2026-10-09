# Build from the backend/src/Blog.Api directory: docker build -t blog-api .
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY Blog.Api.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER app
# Required env vars:
#   ConnectionStrings__Blog  Neon *pooled* connection string, e.g.
#     Host=ep-xxx-pooler.region.aws.neon.tech;Database=blog;Username=...;Password=...;SSL Mode=Require
#   Cloudinary__CloudName, Cloudinary__ApiKey, Cloudinary__ApiSecret
#   Author__Email, Author__Password, Author__DisplayName  (used once to create the author account)
ENTRYPOINT ["dotnet", "Blog.Api.dll"]
