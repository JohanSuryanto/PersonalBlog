using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ContributorPosts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AuthorId",
                table: "Posts",
                type: "text",
                nullable: false,
                defaultValue: "");

            // Existing posts belong to the single account that exists today: the owner.
            migrationBuilder.Sql("UPDATE \"Posts\" SET \"AuthorId\" = (SELECT \"Id\" FROM \"AspNetUsers\" ORDER BY \"Id\" LIMIT 1);");

            migrationBuilder.AddColumn<short>(
                name: "PendingSlot",
                table: "Posts",
                type: "smallint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewNote",
                table: "Posts",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Posts_AuthorId_PendingSlot",
                table: "Posts",
                columns: new[] { "AuthorId", "PendingSlot" },
                unique: true,
                filter: "\"PendingSlot\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Posts_AspNetUsers_AuthorId",
                table: "Posts",
                column: "AuthorId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Posts_AspNetUsers_AuthorId",
                table: "Posts");

            migrationBuilder.DropIndex(
                name: "IX_Posts_AuthorId_PendingSlot",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "AuthorId",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "PendingSlot",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "ReviewNote",
                table: "Posts");
        }
    }
}
