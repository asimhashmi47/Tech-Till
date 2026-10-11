using Microsoft.AspNetCore.Mvc;
using TechTill.Api.Security;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Money;
using TechTill.Application.Features.Purchases;
using TechTill.Application.Features.Sales;
using TechTill.Application.Features.Stock;
using TechTill.Domain.Enums;

namespace TechTill.Api.Controllers;

public sealed class StockController(StockService stock) : ApiControllerBase
{
    [RequirePermission(Module.Stock, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<StockLevelDto>> Query(QueryRequest request, CancellationToken ct)
        => stock.QueryLevelsAsync(request, ct);

    [RequirePermission(Module.Stock, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await stock.ExportLevelsAsync(request, ct).ConfigureAwait(false), "stock");

    [RequirePermission(Module.Stock, Access.Read)]
    [HttpPost("movements/query")]
    public Task<PagedResult<StockMovementDto>> Movements(QueryRequest request, CancellationToken ct)
        => stock.QueryMovementsAsync(request, ct);

    [RequirePermission(Module.Stock, Access.Read)]
    [HttpPost("movements/export")]
    public async Task<IActionResult> ExportMovements(QueryRequest request, CancellationToken ct)
        => Excel(await stock.ExportMovementsAsync(request, ct).ConfigureAwait(false), "stock-movements");

    [RequirePermission(Module.Stock, Access.Write)]
    [HttpPost("opening")]
    public async Task<IActionResult> Opening(OpeningStockRequest request, CancellationToken ct)
    {
        await stock.SetOpeningAsync(request, ct).ConfigureAwait(false);
        return NoContent();
    }

    [RequirePermission(Module.Stock, Access.Write)]
    [HttpPost("adjust")]
    public async Task<IActionResult> Adjust(AdjustStockRequest request, CancellationToken ct)
    {
        await stock.AdjustAsync(request, ct).ConfigureAwait(false);
        return NoContent();
    }

    [RequirePermission(Module.Stock, Access.Write)]
    [HttpPost("transfer")]
    public async Task<IActionResult> Transfer(TransferStockRequest request, CancellationToken ct)
    {
        await stock.TransferAsync(request, ct).ConfigureAwait(false);
        return NoContent();
    }
}

public sealed class PurchasesController(PurchaseService purchases) : ApiControllerBase
{
    [RequirePermission(Module.Purchases, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<PurchaseBillListDto>> Query(QueryRequest request, CancellationToken ct)
        => purchases.QueryAsync(request, ct);

    [RequirePermission(Module.Purchases, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await purchases.ExportAsync(request, ct).ConfigureAwait(false), "purchase-bills");

    [RequirePermission(Module.Purchases, Access.Read)]
    [HttpGet("{id:long}")]
    public Task<PurchaseBillDetailDto> Get(long id, CancellationToken ct) => purchases.GetAsync(id, ct);

    [RequirePermission(Module.Purchases, Access.Write)]
    [HttpPost]
    public Task<PurchaseBillDetailDto> Create(CreatePurchaseRequest request, CancellationToken ct)
        => purchases.CreateAsync(request, ct);

    [RequirePermission(Module.Purchases, Access.Read)]
    [HttpPost("payments/query")]
    public Task<PagedResult<SupplierPaymentDto>> Payments(QueryRequest request, CancellationToken ct)
        => purchases.QueryPaymentsAsync(request, ct);

    [RequirePermission(Module.Purchases, Access.Read)]
    [HttpPost("payments/export")]
    public async Task<IActionResult> ExportPayments(QueryRequest request, CancellationToken ct)
        => Excel(await purchases.ExportPaymentsAsync(request, ct).ConfigureAwait(false), "supplier-payments");

    [RequirePermission(Module.Purchases, Access.Write)]
    [HttpPost("payments")]
    public Task<SupplierPaymentDto> Pay(CreateSupplierPaymentRequest request, CancellationToken ct)
        => purchases.PayAsync(request, ct);
}

/// <summary>The POS till. Completing a sale is the only write here.</summary>
[Route("api/pos")]
public sealed class PosController(SalesService sales) : ApiControllerBase
{
    [RequirePermission(Module.Pos, Access.Write)]
    [HttpPost("sale")]
    public Task<InvoiceDetailDto> Sale(CreateSaleRequest request, CancellationToken ct)
        => sales.CreateSaleAsync(request, ct);
}

public sealed class InvoicesController(SalesService sales) : ApiControllerBase
{
    [RequirePermission(Module.Invoices, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<InvoiceListDto>> Query(QueryRequest request, CancellationToken ct)
        => sales.QueryAsync(request, ct);

    [RequirePermission(Module.Invoices, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await sales.ExportAsync(request, ct).ConfigureAwait(false), "invoices");

    [RequirePermission(Module.Invoices, Access.Read)]
    [HttpGet("{id:long}")]
    public Task<InvoiceDetailDto> Get(long id, CancellationToken ct) => sales.GetAsync(id, ct);

    /// <summary>Admin only. Reverses stock and money, it does not delete the invoice.</summary>
    [AdminOnly]
    [HttpPost("{id:long}/void")]
    public Task<InvoiceDetailDto> Void(long id, VoidInvoiceRequest request, CancellationToken ct)
        => sales.VoidAsync(id, request, ct);
}

public sealed class ExpensesController(ExpenseService expenses) : ApiControllerBase
{
    [RequirePermission(Module.Expenses, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<ExpenseDto>> Query(QueryRequest request, CancellationToken ct)
        => expenses.QueryAsync(request, ct);

    [RequirePermission(Module.Expenses, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await expenses.ExportAsync(request, ct).ConfigureAwait(false), "expenses");

    [HttpGet("categories")]
    public Task<List<ExpenseCategoryDto>> Categories(CancellationToken ct) => expenses.CategoriesAsync(ct);

    [RequirePermission(Module.Expenses, Access.Write)]
    [HttpPost("categories")]
    public Task<ExpenseCategoryDto> CreateCategory(SaveExpenseCategoryRequest request, CancellationToken ct)
        => expenses.CreateCategoryAsync(request, ct);

    [RequirePermission(Module.Expenses, Access.Read)]
    [HttpGet("{id:long}")]
    public Task<ExpenseDto> Get(long id, CancellationToken ct) => expenses.GetAsync(id, ct);

    [RequirePermission(Module.Expenses, Access.Write)]
    [HttpPost]
    public Task<ExpenseDto> Create(SaveExpenseRequest request, CancellationToken ct)
        => expenses.CreateAsync(request, ct);

    [RequirePermission(Module.Expenses, Access.Write)]
    [HttpPut("{id:long}")]
    public Task<ExpenseDto> Update(long id, SaveExpenseRequest request, CancellationToken ct)
        => expenses.UpdateAsync(id, request, ct);

    [RequirePermission(Module.Expenses, Access.Write)]
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        await expenses.DeleteAsync(id, ct).ConfigureAwait(false);
        return NoContent();
    }
}

[Route("api/petty-cash")]
public sealed class PettyCashController(PettyCashService pettyCash) : ApiControllerBase
{
    [RequirePermission(Module.PettyCash, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<PettyCashEntryDto>> Query(QueryRequest request, CancellationToken ct)
        => pettyCash.QueryAsync(request, ct);

    [RequirePermission(Module.PettyCash, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await pettyCash.ExportAsync(request, ct).ConfigureAwait(false), "petty-cash");

    [RequirePermission(Module.PettyCash, Access.Read)]
    [HttpGet("day")]
    public Task<List<PettyCashDayDto>> Day(
        [FromQuery] DateTime? date,
        [FromQuery] long? shopId,
        CancellationToken ct)
        => pettyCash.DayAsync(date ?? DateTime.UtcNow, shopId, ct);

    [RequirePermission(Module.PettyCash, Access.Write)]
    [HttpPost]
    public Task<PettyCashEntryDto> Create(SavePettyCashRequest request, CancellationToken ct)
        => pettyCash.CreateAsync(request, ct);

    [RequirePermission(Module.PettyCash, Access.Write)]
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        await pettyCash.DeleteAsync(id, ct).ConfigureAwait(false);
        return NoContent();
    }
}
