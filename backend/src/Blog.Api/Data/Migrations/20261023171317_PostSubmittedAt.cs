using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PostSubmittedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SubmittedAt",
                table: "Posts",
                type: "timestamp with time zone",
                nullable: true);

            // Posts already waiting: their last edit is the best guess for when they were sent.
            migrationBuilder.Sql("UPDATE \"Posts\" SET \"SubmittedAt\" = \"UpdatedAt\" WHERE \"Status\" = 'Pending';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SubmittedAt",
                table: "Posts");
        }
    }
}
