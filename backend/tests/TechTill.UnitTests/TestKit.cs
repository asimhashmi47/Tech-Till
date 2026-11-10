using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using TechTill.Application.Common.Exceptions;
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
using TechTill.Domain.Entities;
using TechTill.Domain.Enums;
using TechTill.Infrastructure.Persistence;
using TechTill.Infrastructure.Services;

namespace TechTill.UnitTests;

public sealed class FakeClock : IDateTimeProvider
{
    public DateTime UtcNow { get; set; } = TestApp.Now;
}

public sealed class FakeUser : ICurrentUser
{
    public long? UserId { get; set; }
    public string Username { get; set; } = "anonymous";
    public UserRole? Role { get; set; }
    public bool IsAdmin => Role == UserRole.Admin;
    public string? Ip => "127.0.0.1";
    public string? CorrelationId => "test";
}

/// <summary>Fast and reversible, so tests can assert on the stored value without BCrypt's cost.</summary>
public sealed class FakeHasher : IPasswordHasher
{
    public int VerifyCalls { get; private set; }

    public string Hash(string password) => "hash:" + password;

    public bool Verify(string password, string hash)
    {
        VerifyCalls++;
        return hash == "hash:" + password;
    }
}

/// <summary>A private in-memory database with two shops, two users and a little stock.</summary>
public sealed class TestApp : IDisposable
{
    public static readonly DateTime Now = new(2026, 6, 15, 10, 0, 0, DateTimeKind.Utc);
    public const string Password = "correct-horse";

    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly MemoryCache _memory = new(new MemoryCacheOptions());

    public FakeClock Clock { get; } = new();
    public FakeUser User { get; } = new();
    public FakeHasher Hasher { get; } = new();
    public AppDbContext Db { get; }
    public MemoryCacheService Cache { get; }
    public PermissionService Permissions { get; }
    public ShopScope Scope { get; }
    public AuditService Audit { get; }
    public ExcelExportService Excel { get; } = new();
    public JwtOptions Jwt { get; } = new() { Secret = new string('k', 40), AccessTokenMinutes = 30, RefreshTokenDays = 7 };

    public long ShopA { get; private set; }
    public long ShopB { get; private set; }
    public long AdminId { get; private set; }
    public long StaffId { get; private set; }
    public long CategoryId { get; private set; }
    public long LaptopId { get; private set; }
    public long MouseId { get; private set; }
    public long WalkInId { get; private set; }
    public long AcmeId { get; private set; }
    public long SupplierId { get; private set; }
    public long ExpenseCategoryId { get; private set; }

    public TestApp()
    {
        _connection.Open();
        Db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        Db.Database.EnsureCreated();
        Cache = new MemoryCacheService(_memory);
        Permissions = new PermissionService(Db, Cache);
        Scope = new ShopScope(User, Permissions);
        Audit = new AuditService(Db, User, Clock);
        Seed();
        AsAdmin();
    }

    public StockService Stock => new(Db, Audit, User, Scope, Cache, Excel, Clock);
    public DocumentNumberService Numbers => new(Db, Clock);
    public SalesService Sales => new(Db, Stock, Numbers, Audit, User, Scope, Cache, Excel, Clock);
    public PurchaseService Purchases => new(Db, Stock, Numbers, Audit, User, Scope, Cache, Excel, Clock);
    public ExpenseService Expenses => new(Db, Audit, User, Scope, Cache, Excel, Clock);
    public PettyCashService PettyCash => new(Db, Audit, User, Scope, Cache, Excel, Clock);
    public SupplierService Suppliers => new(Db, Audit, User, Scope, Excel, Clock);
    public CustomerService Customers => new(Db, Audit, User, Scope, Excel, Clock);
    public ProductService Products => new(Db, Audit, User, Scope, Cache, Excel, Clock);
    public CategoryService Categories => new(Db, Audit, User, Cache, Excel, Clock);
    public ShopService Shops => new(Db, Audit, User, Permissions, Cache, Excel, Clock);
    public UserService Users => new(Db, Hasher, Audit, User, Permissions, Excel, Clock);
    public SettingsService Settings => new(Db, Audit, User, Cache, Clock);
    public LedgerService Ledgers => new(Db, Scope, Audit, Excel, Clock);
    public ReportService Reports => new(Db, Scope, Audit, Excel, Clock);
    public DashboardService Dashboard => new(Db, Scope, User, Cache, Clock, Ledgers, Stock, Sales);
    public AuditLogService AuditLog => new(Db, Excel, Audit);
    public JwtTokenService Tokens => new(Jwt, Clock);
    public AuthService Auth => new(Db, Hasher, Tokens, Permissions, Audit, User, Cache, Clock);

    public void AsAdmin()
    {
        User.UserId = AdminId;
        User.Username = "admin";
        User.Role = UserRole.Admin;
    }

    public void AsStaff()
    {
        User.UserId = StaffId;
        User.Username = "staff";
        User.Role = UserRole.Standard;
    }

    public void AsNobody()
    {
        User.UserId = null;
        User.Username = "anonymous";
        User.Role = null;
    }

    /// <summary>Drops anything tracked, so assertions see what really reached the database.</summary>
    public AppDbContext Saved()
    {
        Db.ChangeTracker.Clear();
        return Db;
    }

    public int QtyOf(long shopId, long productId)
        => Saved().StockLevels.Where(s => s.ShopId == shopId && s.ProductId == productId).Select(s => s.Qty).FirstOrDefault();

    public Task<InvoiceDetailDto> SellAsync(
        long customerId,
        int qty = 1,
        decimal price = 100m,
        decimal? paid = null,
        PaymentMethod method = PaymentMethod.Cash,
        long? shopId = null,
        long? productId = null)
        => Sales.CreateSaleAsync(new CreateSaleRequest(
            shopId ?? ShopA,
            customerId,
            0m,
            paid ?? qty * price,
            method,
            null,
            [new SaleLineInput(productId ?? LaptopId, qty, price)]));

    /// <summary>Inserts a document directly, for tests that need a specific date.</summary>
    public SalesInvoice AddInvoice(long customerId, DateTime date, decimal total, decimal paid = 0m, long? shopId = null)
    {
        var invoice = new SalesInvoice
        {
            InvoiceNo = "T-" + Guid.NewGuid().ToString("N")[..12],
            ShopId = shopId ?? ShopA,
            CustomerId = customerId,
            InvoiceDate = date,
            SubTotal = total,
            Total = total,
            PaidAmount = paid,
            Status = paid <= 0 ? InvoiceStatus.Unpaid : paid >= total ? InvoiceStatus.Paid : InvoiceStatus.Partial,
            CreatedAt = date
        };
        Db.SalesInvoices.Add(invoice);

        if (paid > 0)
        {
            Db.CustomerPayments.Add(new CustomerPayment
            {
                ShopId = invoice.ShopId,
                CustomerId = customerId,
                SalesInvoice = invoice,
                ReceivedAt = date,
                Amount = paid,
                CreatedAt = date
            });
        }

        Db.SaveChanges();
        return invoice;
    }

    public PurchaseBill AddBill(DateTime date, decimal total, decimal paid = 0m, long? shopId = null)
    {
        var bill = new PurchaseBill
        {
            BillNo = "B-" + Guid.NewGuid().ToString("N")[..12],
            ShopId = shopId ?? ShopA,
            SupplierId = SupplierId,
            BillDate = date,
            Total = total,
            PaidAmount = paid,
            CreatedAt = date
        };
        Db.PurchaseBills.Add(bill);

        if (paid > 0)
        {
            Db.SupplierPayments.Add(new SupplierPayment
            {
                ShopId = bill.ShopId,
                SupplierId = SupplierId,
                PurchaseBill = bill,
                PaidAt = date,
                Amount = paid,
                CreatedAt = date
            });
        }

        Db.SaveChanges();
        return bill;
    }

    private void Seed()
    {
        var shopA = new Shop { Code = "MAIN", Name = "Main Street" };
        var shopB = new Shop { Code = "MALL", Name = "City Mall" };
        Db.Shops.AddRange(shopA, shopB);

        var admin = new AppUser { Username = "admin", FullName = "Shop Owner", Role = UserRole.Admin, PasswordHash = Hasher.Hash(Password) };
        var staff = new AppUser { Username = "staff", FullName = "Sara Khan", Role = UserRole.Standard, PasswordHash = Hasher.Hash(Password) };
        staff.UserShops.Add(new UserShop { Shop = shopA });
        staff.Permissions.Add(new UserPermission { Module = Module.Pos, CanRead = true, CanWrite = true });
        staff.Permissions.Add(new UserPermission { Module = Module.Invoices, CanRead = true, CanWrite = false });
        Db.Users.AddRange(admin, staff);

        var category = new Category { Name = "Laptops" };
        var laptop = new Product { Sku = "LP-1", Name = "Dell Latitude", Category = category, Brand = "Dell", CostPrice = 60m, SalePrice = 100m, ReorderLevel = 3 };
        var mouse = new Product { Sku = "MS-1", Name = "Wireless Mouse", Category = category, Brand = "Logi", CostPrice = 5m, SalePrice = 9m, ReorderLevel = 10 };
        Db.Products.AddRange(laptop, mouse);

        var walkIn = new Customer { Name = "Walk-in customer", IsWalkIn = true };
        var acme = new Customer { Name = "Acme Traders", Phone = "0300" };
        var supplier = new Supplier { Name = "Blue Chip", Phone = "0311" };
        var expenseCategory = new ExpenseCategory { Name = "Rent" };
        Db.Customers.AddRange(walkIn, acme);
        Db.Suppliers.Add(supplier);
        Db.ExpenseCategories.Add(expenseCategory);

        foreach (var (shop, product, qty) in new[] { (shopA, laptop, 10), (shopA, mouse, 5), (shopB, laptop, 2) })
        {
            Db.StockLevels.Add(new StockLevel { Shop = shop, Product = product, Qty = qty });
            Db.StockMovements.Add(new StockMovement
            {
                Shop = shop,
                Product = product,
                Type = StockMovementType.Opening,
                Qty = qty,
                UnitCost = product.CostPrice,
                MovedAt = Now.AddDays(-200),
                CreatedAt = Now.AddDays(-200)
            });
        }

        Db.SaveChanges();
        ShopA = shopA.Id;
        ShopB = shopB.Id;
        AdminId = admin.Id;
        StaffId = staff.Id;
        CategoryId = category.Id;
        LaptopId = laptop.Id;
        MouseId = mouse.Id;
        WalkInId = walkIn.Id;
        AcmeId = acme.Id;
        SupplierId = supplier.Id;
        ExpenseCategoryId = expenseCategory.Id;
        Db.ChangeTracker.Clear();
    }

    public void Dispose()
    {
        Db.Dispose();
        _memory.Dispose();
        _connection.Dispose();
    }
}

public static class Expect
{
    /// <summary>Asserts a 400 keyed to one field.</summary>
    public static async Task InvalidAsync(string field, Func<Task> action)
    {
        var error = await Assert.ThrowsAsync<ValidationFailedException>(action);
        Assert.True(error.Errors.ContainsKey(field), $"Expected an error on '{field}', got: {string.Join(", ", error.Errors.Keys)}");
    }
}
