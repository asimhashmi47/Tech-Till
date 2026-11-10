using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TechTill.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceListIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_ShopId_InvoiceDate_IsDeleted",
                table: "SalesInvoices",
                columns: new[] { "ShopId", "InvoiceDate", "IsDeleted" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_ShopId_InvoiceDate_IsDeleted",
                table: "SalesInvoices");
        }
    }
}
