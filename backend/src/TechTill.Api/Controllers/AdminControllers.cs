using Microsoft.AspNetCore.Mvc;
using TechTill.Api.Security;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Audit;
using TechTill.Application.Features.Dashboard;
using TechTill.Application.Features.Reports;
using TechTill.Application.Features.Users;
using TechTill.Domain.Enums;

namespace TechTill.Api.Controllers;

[AdminOnly]
public sealed class UsersController(UserService users) : ApiControllerBase
{
    [HttpPost("query")]
    public Task<PagedResult<UserListDto>> Query(QueryRequest request, CancellationToken ct)
        => users.QueryAsync(request, ct);

    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await users.ExportAsync(request, ct).ConfigureAwait(false), "users");

    [HttpGet("{id:long}")]
    public Task<UserDetailDto> Get(long id, CancellationToken ct) => users.GetAsync(id, ct);

    /// <summary>The module list the permission matrix renders its rows from.</summary>
    [HttpGet("modules")]
    public ActionResult<IEnumerable<string>> Modules()
        => Ok(Enum.GetNames<Module>());

    [HttpPost]
    public Task<UserDetailDto> Create(SaveUserRequest request, CancellationToken ct)
        => users.CreateAsync(request, ct);

    [HttpPut("{id:long}")]
    public Task<UserDetailDto> Update(long id, SaveUserRequest request, CancellationToken ct)
        => users.UpdateAsync(id, request, ct);

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Deactivate(long id, CancellationToken ct)
    {
        await users.DeactivateAsync(id, ct).ConfigureAwait(false);
        return NoContent();
    }
}

[AdminOnly]
[Route("api/audit-log")]
public sealed class AuditLogController(AuditLogService auditLog) : ApiControllerBase
{
    [HttpPost("query")]
    public Task<PagedResult<AuditLogDto>> Query(QueryRequest request, CancellationToken ct)
        => auditLog.QueryAsync(request, ct);

    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await auditLog.ExportAsync(request, ct).ConfigureAwait(false), "audit-log");
}

public sealed class ReportsController(ReportService reports) : ApiControllerBase
{
    [RequirePermission(Module.Reports, Access.Read)]
    [HttpGet("daily")]
    public Task<List<SummaryRowDto>> Daily([FromQuery] long? shopId, [FromQuery] DateTime? from,
        [FromQuery] DateTime? to, CancellationToken ct)
        => reports.DailyAsync(new ReportFilter(shopId, from, to), ct);

    [RequirePermission(Module.Reports, Access.Read)]
    [HttpGet("monthly")]
    public Task<List<SummaryRowDto>> Monthly([FromQuery] long? shopId, [FromQuery] DateTime? from,
        [FromQuery] DateTime? to, CancellationToken ct)
        => reports.MonthlyAsync(new ReportFilter(shopId, from, to), ct);

    [RequirePermission(Module.Reports, Access.Read)]
    [HttpGet("profit-and-loss")]
    public Task<ProfitAndLossDto> ProfitAndLoss([FromQuery] long? shopId, [FromQuery] DateTime? from,
        [FromQuery] DateTime? to, CancellationToken ct)
        => reports.ProfitAndLossAsync(new ReportFilter(shopId, from, to), ct);

    [RequirePermission(Module.Reports, Access.Read)]
    [HttpGet("balance-sheet")]
    public Task<BalanceSheetDto> BalanceSheet([FromQuery] long? shopId, [FromQuery] DateTime? to, CancellationToken ct)
        => reports.BalanceSheetAsync(new ReportFilter(shopId, null, to), ct);

    [RequirePermission(Module.Reports, Access.Read)]
    [HttpGet("cash-flow")]
    public Task<CashFlowDto> CashFlow([FromQuery] long? shopId, [FromQuery] DateTime? from,
        [FromQuery] DateTime? to, CancellationToken ct)
        => reports.CashFlowAsync(new ReportFilter(shopId, from, to), ct);

    [RequirePermission(Module.Reports, Access.Read)]
    [HttpGet("summary/export")]
    public async Task<IActionResult> ExportSummary([FromQuery] long? shopId, [FromQuery] DateTime? from,
        [FromQuery] DateTime? to, [FromQuery] bool monthly, CancellationToken ct)
        => Excel(
            await reports.ExportSummaryAsync(new ReportFilter(shopId, from, to), monthly, ct).ConfigureAwait(false),
            monthly ? "monthly-summary" : "daily-summary");
}

public sealed class DashboardController(DashboardService dashboard) : ApiControllerBase
{
    /// <summary>Defaults to the last 30 days ending today when no range is given.</summary>
    [RequirePermission(Module.Dashboard, Access.Read)]
    [HttpGet]
    public Task<DashboardDto> Get(
        [FromQuery] long? shopId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct)
        => dashboard.GetAsync(shopId, from, to, ct);
}
