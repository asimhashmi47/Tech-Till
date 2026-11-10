using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TechTill.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOpenInvoiceIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_ShopId_Status_InvoiceDate",
                table: "SalesInvoices",
                columns: new[] { "ShopId", "Status", "InvoiceDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_ShopId_Status_InvoiceDate",
                table: "SalesInvoices");
        }
    }
}
