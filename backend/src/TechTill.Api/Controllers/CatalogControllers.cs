using Microsoft.AspNetCore.Mvc;
using TechTill.Api.Security;
using TechTill.Application.Common.Query;
using TechTill.Application.Features.Catalog;
using TechTill.Domain.Enums;

namespace TechTill.Api.Controllers;

public sealed class CategoriesController(CategoryService categories) : ApiControllerBase
{
    [RequirePermission(Module.Products, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<CategoryDto>> Query(QueryRequest request, CancellationToken ct)
        => categories.QueryAsync(request, ct);

    [RequirePermission(Module.Products, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await categories.ExportAsync(request, ct).ConfigureAwait(false), "categories");

    [HttpGet("lookup")]
    public Task<List<CategoryDto>> Lookup(CancellationToken ct) => categories.LookupAsync(ct);

    [RequirePermission(Module.Products, Access.Write)]
    [HttpPost]
    public Task<CategoryDto> Create(SaveCategoryRequest request, CancellationToken ct)
        => categories.CreateAsync(request, ct);

    [RequirePermission(Module.Products, Access.Write)]
    [HttpPut("{id:long}")]
    public Task<CategoryDto> Update(long id, SaveCategoryRequest request, CancellationToken ct)
        => categories.UpdateAsync(id, request, ct);

    [RequirePermission(Module.Products, Access.Write)]
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        await categories.DeleteAsync(id, ct).ConfigureAwait(false);
        return NoContent();
    }
}

public sealed class ProductsController(ProductService products) : ApiControllerBase
{
    [RequirePermission(Module.Products, Access.Read)]
    [HttpPost("query")]
    public Task<PagedResult<ProductDto>> Query(QueryRequest request, CancellationToken ct)
        => products.QueryAsync(request, ct);

    [RequirePermission(Module.Products, Access.Read)]
    [HttpPost("export")]
    public async Task<IActionResult> Export(QueryRequest request, CancellationToken ct)
        => Excel(await products.ExportAsync(request, ct).ConfigureAwait(false), "products");

    [RequirePermission(Module.Products, Access.Read)]
    [HttpGet("{id:long}")]
    public Task<ProductDto> Get(long id, CancellationToken ct) => products.GetAsync(id, ct);

    /// <summary>POS search box and barcode field. Returns stock for the selected shop.</summary>
    [RequirePermission(Module.Pos, Access.Read)]
    [HttpGet("pos-search")]
    public Task<List<PosProductDto>> PosSearch(
        [FromQuery] long shopId,
        [FromQuery] string? term,
        [FromQuery] int take,
        CancellationToken ct)
        => products.SearchForPosAsync(shopId, term, take == 0 ? 30 : take, ct);

    [RequirePermission(Module.Products, Access.Write)]
    [HttpPost]
    public Task<ProductDto> Create(SaveProductRequest request, CancellationToken ct)
        => products.CreateAsync(request, ct);

    [RequirePermission(Module.Products, Access.Write)]
    [HttpPut("{id:long}")]
    public Task<ProductDto> Update(long id, SaveProductRequest request, CancellationToken ct)
        => products.UpdateAsync(id, request, ct);

    [RequirePermission(Module.Products, Access.Write)]
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        await products.DeleteAsync(id, ct).ConfigureAwait(false);
        return NoContent();
    }
}
