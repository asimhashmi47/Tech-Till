using Microsoft.AspNetCore.Mvc;
using TechTill.Api.Security;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Shops;
using TechTill.Domain.Enums;

namespace TechTill.Api.Controllers;

public sealed class ShopsController(ShopService shops) : ApiControllerBase
{
    [RequirePermission(Module.Shops, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<ShopDto>> Query(QueryRequest request, CancellationToken ct)
        => shops.QueryAsync(request, ct);

    [RequirePermission(Module.Shops, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await shops.ExportAsync(request, ct).ConfigureAwait(false), "shops");

    /// <summary>Shops the signed in user may switch between. Used by the top bar.</summary>
    [HttpGet("lookup")]
    public Task<IReadOnlyList<ShopDto>> Lookup(CancellationToken ct) => shops.LookupAsync(ct);

    [RequirePermission(Module.Shops, Access.Read)]
    [HttpGet("{id:long}")]
    public Task<ShopDto> Get(long id, CancellationToken ct) => shops.GetAsync(id, ct);

    [RequirePermission(Module.Shops, Access.Write)]
    [HttpPost]
    public Task<ShopDto> Create(SaveShopRequest request, CancellationToken ct)
        => shops.CreateAsync(request, ct);

    [RequirePermission(Module.Shops, Access.Write)]
    [HttpPut("{id:long}")]
    public Task<ShopDto> Update(long id, SaveShopRequest request, CancellationToken ct)
        => shops.UpdateAsync(id, request, ct);
}
