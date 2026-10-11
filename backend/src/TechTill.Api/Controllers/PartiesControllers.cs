using Microsoft.AspNetCore.Mvc;
using TechTill.Api.Security;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Ledgers;
using TechTill.Application.Features.Parties;
using TechTill.Application.Features.Sales;
using TechTill.Domain.Enums;

namespace TechTill.Api.Controllers;

public sealed class SuppliersController(SupplierService suppliers, LedgerService ledgers) : ApiControllerBase
{
    [RequirePermission(Module.Suppliers, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<SupplierDto>> Query(QueryRequest request, CancellationToken ct)
        => suppliers.QueryAsync(request, ct);

    [RequirePermission(Module.Suppliers, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await suppliers.ExportAsync(request, ct).ConfigureAwait(false), "suppliers");

    [HttpGet("lookup")]
    public Task<List<SupplierDto>> Lookup(CancellationToken ct) => suppliers.LookupAsync(ct);

    [RequirePermission(Module.Suppliers, Access.Read)]
    [HttpGet("{id:long}")]
    public Task<SupplierDto> Get(long id, CancellationToken ct) => suppliers.GetAsync(id, ct);

    [RequirePermission(Module.Suppliers, Access.Read)]
    [HttpGet("{id:long}/ledger")]
    public Task<LedgerDto> Ledger(
        long id,
        [FromQuery] long? shopId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct)
        => ledgers.SupplierLedgerAsync(id, shopId, from, to, ct);

    [RequirePermission(Module.Suppliers, Access.Write)]
    [HttpPost]
    public Task<SupplierDto> Create(SaveSupplierRequest request, CancellationToken ct)
        => suppliers.CreateAsync(request, ct);

    [RequirePermission(Module.Suppliers, Access.Write)]
    [HttpPut("{id:long}")]
    public Task<SupplierDto> Update(long id, SaveSupplierRequest request, CancellationToken ct)
        => suppliers.UpdateAsync(id, request, ct);

    [RequirePermission(Module.Suppliers, Access.Write)]
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        await suppliers.DeleteAsync(id, ct).ConfigureAwait(false);
        return NoContent();
    }
}

public sealed class CustomersController(
    CustomerService customers,
    LedgerService ledgers,
    SalesService sales) : ApiControllerBase
{
    [RequirePermission(Module.Customers, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<CustomerDto>> Query(QueryRequest request, CancellationToken ct)
        => customers.QueryAsync(request, ct);

    [RequirePermission(Module.Customers, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await customers.ExportAsync(request, ct).ConfigureAwait(false), "customers");

    [HttpGet("lookup")]
    public Task<List<CustomerDto>> Lookup(CancellationToken ct) => customers.LookupAsync(ct);

    [RequirePermission(Module.Customers, Access.Read)]
    [HttpGet("{id:long}")]
    public Task<CustomerDto> Get(long id, CancellationToken ct) => customers.GetAsync(id, ct);

    [RequirePermission(Module.Customers, Access.Read)]
    [HttpGet("{id:long}/ledger")]
    public Task<LedgerDto> Ledger(
        long id,
        [FromQuery] long? shopId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct)
        => ledgers.CustomerLedgerAsync(id, shopId, from, to, ct);

    [RequirePermission(Module.Customers, Access.Write)]
    [HttpPost]
    public Task<CustomerDto> Create(SaveCustomerRequest request, CancellationToken ct)
        => customers.CreateAsync(request, ct);

    [RequirePermission(Module.Customers, Access.Write)]
    [HttpPut("{id:long}")]
    public Task<CustomerDto> Update(long id, SaveCustomerRequest request, CancellationToken ct)
        => customers.UpdateAsync(id, request, ct);

    [RequirePermission(Module.Customers, Access.Write)]
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        await customers.DeleteAsync(id, ct).ConfigureAwait(false);
        return NoContent();
    }

    [RequirePermission(Module.Customers, Access.Read)]
    [HttpPost("payments/query")]
    public Task<PagedResult<CustomerPaymentDto>> PaymentHistory(QueryRequest request, CancellationToken ct)
        => sales.QueryPaymentsAsync(request, ct);

    [RequirePermission(Module.Customers, Access.Read)]
    [HttpPost("payments/export")]
    public async Task<IActionResult> ExportPayments(QueryRequest request, CancellationToken ct)
        => Excel(await sales.ExportPaymentsAsync(request, ct).ConfigureAwait(false), "customer-payments");

    [RequirePermission(Module.Customers, Access.Write)]
    [HttpPost("payments")]
    public Task<CustomerPaymentDto> Receive(CreateCustomerPaymentRequest request, CancellationToken ct)
        => sales.ReceiveAsync(request, ct);
}

/// <summary>Receivable and payable ageing, customer-wise and invoice-wise.</summary>
[Route("api/ageing")]
public sealed class AgeingController(LedgerService ledgers) : ApiControllerBase
{
    [RequirePermission(Module.Customers, Access.Read)]
    [HttpPost("receivable")]
    public Task<AgeingResultDto> Receivable(
        QueryRequest request,
        [FromQuery] bool invoiceWise,
        CancellationToken ct)
        => ledgers.CustomerAgeingAsync(request, invoiceWise, ct);

    [RequirePermission(Module.Customers, Access.Read)]
    [HttpPost("receivable/export")]
    public async Task<IActionResult> ExportReceivable(
        QueryRequest request,
        [FromQuery] bool invoiceWise,
        CancellationToken ct)
        => Excel(
            await ledgers.ExportAgeingAsync(request, invoiceWise, receivable: true, ct).ConfigureAwait(false),
            invoiceWise ? "receivable-ageing-by-invoice" : "receivable-ageing-by-customer");

    [RequirePermission(Module.Suppliers, Access.Read)]
    [HttpPost("payable")]
    public Task<AgeingResultDto> Payable(
        QueryRequest request,
        [FromQuery] bool invoiceWise,
        CancellationToken ct)
        => ledgers.SupplierAgeingAsync(request, invoiceWise, ct);

    [RequirePermission(Module.Suppliers, Access.Read)]
    [HttpPost("payable/export")]
    public async Task<IActionResult> ExportPayable(
        QueryRequest request,
        [FromQuery] bool invoiceWise,
        CancellationToken ct)
        => Excel(
            await ledgers.ExportAgeingAsync(request, invoiceWise, receivable: false, ct).ConfigureAwait(false),
            invoiceWise ? "payable-ageing-by-bill" : "payable-ageing-by-supplier");
}
