using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TechTill.Application.Common.Interfaces;
using TechTill.Application.Features.Audit;
using TechTill.Application.Features.Auth;
using TechTill.Application.Features.Catalog;
using TechTill.Application.Features.Common;
using TechTill.Application.Features.Dashboard;
using TechTill.Application.Features.Ledgers;
using TechTill.Application.Features.Money;
using TechTill.Application.Features.Parties;
using TechTill.Application.Features.Purchases;
using TechTill.Application.Features.Reports;
using TechTill.Application.Features.Sales;
using TechTill.Application.Features.Settings;
using TechTill.Application.Features.Shops;
using TechTill.Application.Features.Stock;
using TechTill.Application.Features.Users;
using TechTill.Infrastructure.Persistence;
using TechTill.Infrastructure.Services;

namespace TechTill.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connection = configuration.GetConnectionString("Default") ?? "Data Source=techtill.db";

        services.AddDbContext<AppDbContext>(options => options
            .UseSqlite(connection, sqlite => sqlite.CommandTimeout(60))
            .UseQueryTrackingBehavior(QueryTrackingBehavior.TrackAll));

        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddMemoryCache();

        var jwt = new JwtOptions();
        configuration.GetSection(JwtOptions.SectionName).Bind(jwt);

        if (string.IsNullOrWhiteSpace(jwt.Secret) || jwt.Secret.Length < 32)
        {
            throw new InvalidOperationException(
                "Jwt:Secret must be set to at least 32 characters. Use dotnet user-secrets or the JWT__SECRET " +
                "environment variable. See the README configuration section.");
        }

        services.AddSingleton(jwt);
        services.AddSingleton<IDateTimeProvider, SystemDateTimeProvider>();
        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        services.AddSingleton<IExcelExportService, ExcelExportService>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        // Singleton, not scoped: the service tracks which keys belong to which group so
        // one write can drop a whole group. A per request instance would start with an
        // empty map, so RemoveGroup would silently do nothing and cached dashboards,
        // lookups and settings would never refresh.
        services.AddSingleton<ICacheService, MemoryCacheService>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<IShopScope, ShopScope>();
        services.AddScoped<DatabaseSeeder>();

        return services.AddApplicationServices();
    }

    private static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<DocumentNumberService>();
        services.AddScoped<AuthService>();
        services.AddScoped<ShopService>();
        services.AddScoped<UserService>();
        services.AddScoped<CategoryService>();
        services.AddScoped<ProductService>();
        services.AddScoped<SupplierService>();
        services.AddScoped<CustomerService>();
        services.AddScoped<StockService>();
        services.AddScoped<PurchaseService>();
        services.AddScoped<SalesService>();
        services.AddScoped<ExpenseService>();
        services.AddScoped<PettyCashService>();
        services.AddScoped<LedgerService>();
        services.AddScoped<ReportService>();
        services.AddScoped<DashboardService>();
        services.AddScoped<AuditLogService>();
        services.AddScoped<SettingsService>();

        return services;
    }
}
