using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TechTill.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSaleIdempotencyKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "SalesInvoices",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_ShopId_CreatedBy_IdempotencyKey",
                table: "SalesInvoices",
                columns: new[] { "ShopId", "CreatedBy", "IdempotencyKey" },
                unique: true,
                filter: "\"IdempotencyKey\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_ShopId_CreatedBy_IdempotencyKey",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "SalesInvoices");
        }
    }
}
