using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Common.Interfaces;
using TechTill.Application.Common.Query;
using TechTill.Domain.Entities;
using TechTill.Domain.Enums;

namespace TechTill.Application.Features.Catalog;

public sealed record ProductDto
{
    public long Id { get; init; }
    public string Sku { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public long CategoryId { get; init; }
    public string CategoryName { get; init; } = string.Empty;
    public string? Brand { get; init; }
    public decimal CostPrice { get; init; }
    public decimal SalePrice { get; init; }
    public int ReorderLevel { get; init; }
    public bool IsActive { get; init; }
    public int TotalStock { get; init; }
}

public sealed record SaveProductRequest(
    string Sku,
    string Name,
    long CategoryId,
    string? Brand,
    decimal CostPrice,
    decimal SalePrice,
    int ReorderLevel,
    bool IsActive);

/// <summary>Row returned by the POS product search, scoped to one shop's stock.</summary>
public sealed record PosProductDto
{
    public long Id { get; init; }
    public string Sku { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string CategoryName { get; init; } = string.Empty;
    public decimal SalePrice { get; init; }
    public int Qty { get; init; }
}

public sealed class ProductService(
    IAppDbContext db,
    IAuditService audit,
    ICurrentUser currentUser,
    IShopScope shopScope,
    ICacheService cache,
    IExcelExportService excel,
    IDateTimeProvider clock)
{
    public static QuerySpec<ProductDto> Spec { get; } = new QuerySpec<ProductDto>()
        .Map("id", p => p.Id, "Id")
        .Text("sku", p => p.Sku, "SKU")
        .Text("name", p => p.Name, "Product")
        .Text("categoryName", p => p.CategoryName, "Category")
        .Text("brand", p => p.Brand, "Brand")
        .Map("costPrice", p => p.CostPrice, "Cost")
        .Map("salePrice", p => p.SalePrice, "Price")
        .Map("reorderLevel", p => p.ReorderLevel, "Reorder level")
        .Map("totalStock", p => p.TotalStock, "Stock")
        .Map("isActive", p => p.IsActive, "Active");

    public async Task<PagedResult<ProductDto>> QueryAsync(QueryRequest request, CancellationToken ct = default)
        => await QueryRunner
            .RunAsync(await ProjectedAsync(request.ShopId, ct).ConfigureAwait(false), request, Spec, ct)
            .ConfigureAwait(false);

    public async Task<byte[]> ExportAsync(QueryRequest request, CancellationToken ct = default)
    {
        var source = await ProjectedAsync(request.ShopId, ct).ConfigureAwait(false);
        var rows = await QueryRunner.RunForExportAsync(source, request, Spec, ct).ConfigureAwait(false);
        await audit.LogAsync(Module.Products, AuditAction.Export, nameof(Product), summary: $"{rows.Count} rows", ct: ct)
            .ConfigureAwait(false);
        return excel.Build("Products", rows, Spec, request.Columns);
    }

    public async Task<ProductDto> GetAsync(long id, CancellationToken ct = default)
    {
        var source = await ProjectedAsync(null, ct).ConfigureAwait(false);
        return await source.FirstOrDefaultAsync(p => p.Id == id, ct).ConfigureAwait(false)
            ?? throw new NotFoundException(nameof(Product), id);
    }

    /// <summary>Fast lookup for the POS search box. Matches SKU or name and shows shop stock.</summary>
    public async Task<List<PosProductDto>> SearchForPosAsync(
        long shopId,
        string? term,
        int take = 30,
        CancellationToken ct = default)
    {
        await shopScope.ResolveAsync(shopId, ct).ConfigureAwait(false);

        var query = db.Products.AsNoTracking().Where(p => p.IsActive && !p.IsDeleted);

        if (!string.IsNullOrWhiteSpace(term))
        {
            // LIKE keeps the match case insensitive in SQLite and stays a parameterised query.
            var needle = $"%{term.Trim()}%";
            query = query.Where(p =>
                EF.Functions.Like(p.Sku, needle) ||
                EF.Functions.Like(p.Name, needle) ||
                (p.Brand != null && EF.Functions.Like(p.Brand, needle)));
        }

        return await query
            .OrderBy(p => p.Name)
            .Take(take is < 1 or > 100 ? 30 : take)
            .Select(p => new PosProductDto
    {
        Id = p.Id,
        Sku = p.Sku,
        Name = p.Name,
        CategoryName = p.Category.Name,
        SalePrice = p.SalePrice,
        Qty = db.StockLevels.Where(s => s.ProductId == p.Id && s.ShopId == shopId).Sum(s => s.Qty)
    })
            .ToListAsync(ct)
            .ConfigureAwait(false);
    }

    public async Task<ProductDto> CreateAsync(SaveProductRequest request, CancellationToken ct = default)
    {
        Validate(request);
        var sku = request.Sku.Trim().ToUpperInvariant();

        if (await db.Products.AnyAsync(p => p.Sku == sku && !p.IsDeleted, ct).ConfigureAwait(false))
        {
            throw ValidationFailedException.ForField(nameof(request.Sku), "That SKU is already in use.");
        }

        if (!await db.Categories.AnyAsync(c => c.Id == request.CategoryId && !c.IsDeleted, ct).ConfigureAwait(false))
        {
            throw ValidationFailedException.ForField(nameof(request.CategoryId), "Pick a valid category.");
        }

        var entity = new Product
        {
            Sku = sku,
            Name = request.Name.Trim(),
            CategoryId = request.CategoryId,
            Brand = request.Brand?.Trim(),
            CostPrice = request.CostPrice,
            SalePrice = request.SalePrice,
            ReorderLevel = request.ReorderLevel,
            IsActive = request.IsActive,
            CreatedAt = clock.UtcNow,
            CreatedBy = currentUser.Username
        };

        db.Products.Add(entity);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        cache.RemoveGroup(CacheKeys.Dashboard);

        await audit.LogAsync(Module.Products, AuditAction.Create, nameof(Product), entity.Id, $"{sku} {entity.Name}", ct: ct)
            .ConfigureAwait(false);
        return await GetAsync(entity.Id, ct).ConfigureAwait(false);
    }

    public async Task<ProductDto> UpdateAsync(long id, SaveProductRequest request, CancellationToken ct = default)
    {
        Validate(request);

        var entity = await db.Products.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct).ConfigureAwait(false)
            ?? throw new NotFoundException(nameof(Product), id);

        var sku = request.Sku.Trim().ToUpperInvariant();
        if (await db.Products.AnyAsync(p => p.Sku == sku && p.Id != id && !p.IsDeleted, ct).ConfigureAwait(false))
        {
            throw ValidationFailedException.ForField(nameof(request.Sku), "That SKU is already in use.");
        }

        var before = $"{entity.Sku}/{entity.Name}/cost={entity.CostPrice}/price={entity.SalePrice}";
        entity.Sku = sku;
        entity.Name = request.Name.Trim();
        entity.CategoryId = request.CategoryId;
        entity.Brand = request.Brand?.Trim();
        entity.CostPrice = request.CostPrice;
        entity.SalePrice = request.SalePrice;
        entity.ReorderLevel = request.ReorderLevel;
        entity.IsActive = request.IsActive;
        entity.UpdatedAt = clock.UtcNow;
        entity.UpdatedBy = currentUser.Username;

        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        cache.RemoveGroup(CacheKeys.Dashboard);

        await audit.LogAsync(
            Module.Products,
            AuditAction.Update,
            nameof(Product),
            id,
            $"{before} -> {sku}/{entity.Name}/cost={entity.CostPrice}/price={entity.SalePrice}",
            ct: ct).ConfigureAwait(false);

        return await GetAsync(id, ct).ConfigureAwait(false);
    }

    public async Task DeleteAsync(long id, CancellationToken ct = default)
    {
        var entity = await db.Products.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct).ConfigureAwait(false)
            ?? throw new NotFoundException(nameof(Product), id);

        var hasHistory = await db.SalesItems.AnyAsync(i => i.ProductId == id, ct).ConfigureAwait(false)
            || await db.PurchaseItems.AnyAsync(i => i.ProductId == id, ct).ConfigureAwait(false);

        if (hasHistory)
        {
            // History matters here, so the product is retired rather than removed.
            entity.IsActive = false;
        }
        else
        {
            entity.IsDeleted = true;
        }

        entity.UpdatedAt = clock.UtcNow;
        entity.UpdatedBy = currentUser.Username;

        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        cache.RemoveGroup(CacheKeys.Dashboard);

        await audit.LogAsync(
            Module.Products,
            AuditAction.Delete,
            nameof(Product),
            id,
            hasHistory ? $"{entity.Sku} deactivated (has history)" : $"{entity.Sku} removed",
            ct: ct).ConfigureAwait(false);
    }

    private static void Validate(SaveProductRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Sku))
        {
            errors[nameof(request.Sku)] = ["SKU is required."];
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors[nameof(request.Name)] = ["Product name is required."];
        }

        if (request.CostPrice < 0)
        {
            errors[nameof(request.CostPrice)] = ["Cost cannot be negative."];
        }

        if (request.SalePrice < 0)
        {
            errors[nameof(request.SalePrice)] = ["Price cannot be negative."];
        }

        if (request.ReorderLevel < 0)
        {
            errors[nameof(request.ReorderLevel)] = ["Reorder level cannot be negative."];
        }

        if (errors.Count > 0)
        {
            throw new ValidationFailedException(errors);
        }
    }

    /// <summary>
    /// The stock column only counts shops the caller may see, so a standard user never
    /// learns the group wide quantity of a product.
    /// </summary>
    private async Task<IQueryable<ProductDto>> ProjectedAsync(long? shopId, CancellationToken ct)
    {
        var shopIds = await shopScope.ResolveAsync(shopId, ct).ConfigureAwait(false);

        return db.Products
            .AsNoTracking()
            .Where(p => !p.IsDeleted)
            .Select(p => new ProductDto
    {
        Id = p.Id,
        Sku = p.Sku,
        Name = p.Name,
        CategoryId = p.CategoryId,
        CategoryName = p.Category.Name,
        Brand = p.Brand,
        CostPrice = p.CostPrice,
        SalePrice = p.SalePrice,
        ReorderLevel = p.ReorderLevel,
        IsActive = p.IsActive,
        TotalStock = db.StockLevels.Where(s => s.ProductId == p.Id && shopIds.Contains(s.ShopId)).Sum(s => s.Qty)
    });
    }
}
