using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TechTill.Application.Common.Interfaces;
using TechTill.Domain.Entities;
using TechTill.Domain.Enums;

namespace TechTill.Infrastructure.Persistence;

/// <summary>
/// Fills an empty database with enough history for every dashboard card and chart to show
/// something on first run: two shops, 25 products, 90 days of sales, purchases and expenses.
/// Passwords for the demo accounts are documented in the README and are for local use only.
/// </summary>
public sealed class DatabaseSeeder(AppDbContext db, IPasswordHasher hasher, ILogger<DatabaseSeeder> logger)
{
    private const string DemoPassword = "TechTill#2026";

    private static readonly Action<ILogger, Exception?> LogSeedStart =
        LoggerMessage.Define(LogLevel.Information, new EventId(1, "SeedStart"), "Seeding the TechTill demo database");

    private static readonly Action<ILogger, Exception?> LogSeedDone =
        LoggerMessage.Define(LogLevel.Information, new EventId(2, "SeedDone"), "Seed complete");

    private static readonly Random Rng = new(20260411);

    public async Task SeedAsync(CancellationToken ct = default)
    {
        await db.Database.MigrateAsync(ct).ConfigureAwait(false);

        if (await db.Shops.AnyAsync(ct).ConfigureAwait(false))
        {
            return;
        }

        LogSeedStart(logger, null);

        db.AppSettings.Add(New(new AppSetting { Key = "Currency", Value = "PKR" }));

        var shops = SeedShops();
        db.Shops.AddRange(shops);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        var users = SeedUsers(shops);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        var categories = SeedCategories();
        db.Categories.AddRange(categories);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        var products = SeedProducts(categories);
        db.Products.AddRange(products);

        var suppliers = SeedSuppliers();
        db.Suppliers.AddRange(suppliers);

        var customers = SeedCustomers();
        db.Customers.AddRange(customers);

        var expenseCategories = SeedExpenseCategories();
        db.ExpenseCategories.AddRange(expenseCategories);

        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        await SeedOpeningStockAsync(shops, products, ct).ConfigureAwait(false);
        await SeedPurchasesAsync(shops, suppliers, products, ct).ConfigureAwait(false);
        await SeedSalesAsync(shops, customers, products, users, ct).ConfigureAwait(false);
        await SeedExpensesAsync(shops, expenseCategories, ct).ConfigureAwait(false);

        LogSeedDone(logger, null);
    }

    private static List<Shop> SeedShops() =>
    [
        New(new Shop { Code = "MAIN", Name = "TechTill Main Street", Address = "12 Main Street", Phone = "0300 1110001" }),
        New(new Shop { Code = "MALL", Name = "TechTill City Mall", Address = "Shop 48, City Mall", Phone = "0300 1110002" })
    ];

    private List<AppUser> SeedUsers(List<Shop> shops)
    {
        var hash = hasher.Hash(DemoPassword);

        var admin = New(new AppUser
        {
            Username = "admin",
            FullName = "Shop Owner",
            Role = UserRole.Admin,
            PasswordHash = hash
        });

        db.Users.Add(admin);

        // Five standard users with deliberately different access, so the permission matrix
        // can be seen working without any setup.
        var staff = new (string Username, string Name, Module[] Write, Module[] ReadOnly, int[] Shops)[]
        {
            ("sara", "Sara Khan", [Module.Pos, Module.Invoices, Module.Customers],
                [Module.Dashboard, Module.Products, Module.Stock], [0]),
            ("bilal", "Bilal Ahmed", [Module.Pos, Module.Invoices, Module.Customers, Module.Expenses, Module.PettyCash],
                [Module.Dashboard, Module.Products, Module.Stock, Module.Reports], [1]),
            ("hina", "Hina Yousaf", [Module.Products, Module.Stock, Module.Purchases, Module.Suppliers],
                [Module.Dashboard, Module.Invoices, Module.Reports], [0, 1]),
            ("omar", "Omar Farooq", [Module.Expenses, Module.PettyCash],
                [Module.Dashboard, Module.Reports, Module.Invoices], [0, 1]),
            ("zoya", "Zoya Malik", [],
                [Module.Dashboard, Module.Invoices, Module.Products, Module.Stock, Module.Reports], [0])
        };

        var users = new List<AppUser> { admin };

        foreach (var (username, name, write, readOnly, shopIndexes) in staff)
        {
            var user = New(new AppUser
            {
                Username = username,
                FullName = name,
                Role = UserRole.Standard,
                PasswordHash = hash
            });

            db.Users.Add(user);
            users.Add(user);

            foreach (var index in shopIndexes)
            {
                user.UserShops.Add(new UserShop { ShopId = shops[index].Id });
            }

            foreach (var module in write)
            {
                user.Permissions.Add(new UserPermission { Module = module, CanRead = true, CanWrite = true });
            }

            foreach (var module in readOnly.Where(m => !write.Contains(m)))
            {
                user.Permissions.Add(new UserPermission { Module = module, CanRead = true, CanWrite = false });
            }
        }

        return users;
    }

    private static List<Category> SeedCategories() =>
    [
        New(new Category { Name = "Computer" }),
        New(new Category { Name = "Laptop" }),
        New(new Category { Name = "Accessory" }),
        New(new Category { Name = "Networking" })
    ];

    private static List<Product> SeedProducts(List<Category> categories)
    {
        var computer = categories[0].Id;
        var laptop = categories[1].Id;
        var accessory = categories[2].Id;
        var networking = categories[3].Id;

        var rows = new (string Sku, string Name, long Category, string Brand, decimal Cost, decimal Price, int Reorder)[]
        {
            ("PC-RYZ5-001", "Desktop Ryzen 5 / 16GB / 512GB", computer, "Custom Build", 92000m, 112000m, 3),
            ("PC-I5-002", "Desktop Core i5 / 8GB / 256GB", computer, "Custom Build", 74000m, 92500m, 3),
            ("PC-I7-003", "Desktop Core i7 / 32GB / 1TB", computer, "Custom Build", 148000m, 179000m, 2),
            ("PC-OFF-004", "Office PC Dual Core / 4GB", computer, "Refurb", 26000m, 34500m, 5),
            ("PC-GAM-005", "Gaming Rig RTX 4060", computer, "Custom Build", 235000m, 279000m, 2),
            ("LP-DEL-101", "Dell Latitude 5420 i5", laptop, "Dell", 118000m, 142000m, 3),
            ("LP-HP-102", "HP ProBook 450 G9 i5", laptop, "HP", 124000m, 149500m, 3),
            ("LP-LEN-103", "Lenovo ThinkPad T14 i7", laptop, "Lenovo", 186000m, 219000m, 2),
            ("LP-ASU-104", "Asus Vivobook 15 Ryzen 5", laptop, "Asus", 96000m, 117500m, 4),
            ("LP-ACE-105", "Acer Aspire 5 i3", laptop, "Acer", 78000m, 96000m, 4),
            ("LP-MAC-106", "MacBook Air M2 256GB", laptop, "Apple", 268000m, 309000m, 2),
            ("AC-KEY-201", "Mechanical Keyboard RGB", accessory, "Redragon", 6200m, 8900m, 10),
            ("AC-MOU-202", "Wireless Mouse 2.4G", accessory, "Logitech", 2100m, 3450m, 15),
            ("AC-HDS-203", "Headset with Mic", accessory, "HyperX", 7400m, 10500m, 8),
            ("AC-SSD-204", "SSD 1TB NVMe", accessory, "Samsung", 14500m, 18900m, 10),
            ("AC-RAM-205", "RAM 8GB DDR4 3200", accessory, "Kingston", 5900m, 8200m, 12),
            ("AC-HDD-206", "HDD 2TB SATA", accessory, "Seagate", 11200m, 14800m, 8),
            ("AC-MON-207", "Monitor 24in IPS 75Hz", accessory, "Dell", 32000m, 39500m, 6),
            ("AC-UPS-208", "UPS 1000VA", accessory, "APC", 21500m, 27400m, 5),
            ("AC-WEB-209", "Webcam 1080p", accessory, "Logitech", 6800m, 9400m, 8),
            ("AC-CAB-210", "HDMI Cable 2m", accessory, "Generic", 650m, 1250m, 25),
            ("AC-PAD-211", "Mouse Pad XL", accessory, "Generic", 780m, 1600m, 20),
            ("NW-RTR-301", "Wi-Fi Router AC1200", networking, "TP-Link", 7900m, 10900m, 8),
            ("NW-SWT-302", "Switch 8 Port Gigabit", networking, "TP-Link", 6400m, 8800m, 6),
            ("NW-CAT-303", "Cat6 Cable 50m Box", networking, "Generic", 9200m, 12500m, 4)
        };

        return rows
            .Select(r => New(new Product
            {
                Sku = r.Sku,
                Name = r.Name,
                CategoryId = r.Category,
                Brand = r.Brand,
                CostPrice = r.Cost,
                SalePrice = r.Price,
                ReorderLevel = r.Reorder
            }))
            .ToList();
    }

    private static List<Supplier> SeedSuppliers() =>
    [
        New(new Supplier { Name = "Hafeez Centre Distributors", Phone = "042 3570001", Address = "Hafeez Centre, Lahore" }),
        New(new Supplier { Name = "Galaxy IT Supplies", Phone = "021 3480002", Address = "Saddar, Karachi" }),
        New(new Supplier { Name = "Blue Chip Computers", Phone = "051 2820003", Address = "Blue Area, Islamabad" })
    ];

    private static List<Customer> SeedCustomers() =>
    [
        New(new Customer { Name = "Walk-in customer", IsWalkIn = true }),
        New(new Customer { Name = "Crescent School System", Phone = "0301 2345671", Address = "Model Town" }),
        New(new Customer { Name = "Riaz Textiles", Phone = "0301 2345672", Address = "Industrial Estate" }),
        New(new Customer { Name = "Dr Amina Clinic", Phone = "0301 2345673", Address = "Gulberg" }),
        New(new Customer { Name = "Nova Software House", Phone = "0301 2345674", Address = "Johar Town" }),
        New(new Customer { Name = "Faisal Traders", Phone = "0301 2345675", Address = "Shadman" })
    ];

    private static List<ExpenseCategory> SeedExpenseCategories() =>
    [
        New(new ExpenseCategory { Name = "Rent" }),
        New(new ExpenseCategory { Name = "Salaries" }),
        New(new ExpenseCategory { Name = "Utilities" }),
        New(new ExpenseCategory { Name = "Transport" }),
        New(new ExpenseCategory { Name = "Marketing" }),
        New(new ExpenseCategory { Name = "Repairs" })
    ];

    private async Task SeedOpeningStockAsync(List<Shop> shops, List<Product> products, CancellationToken ct)
    {
        var opened = Now.AddDays(-185);

        foreach (var shop in shops)
        {
            foreach (var product in products)
            {
                var qty = Rng.Next(4, 26);

                db.StockLevels.Add(new StockLevel { ShopId = shop.Id, ProductId = product.Id, Qty = qty });
                db.StockMovements.Add(New(new StockMovement
                {
                    ShopId = shop.Id,
                    ProductId = product.Id,
                    Type = StockMovementType.Opening,
                    Qty = qty,
                    UnitCost = product.CostPrice,
                    MovedAt = opened,
                    Reference = "Opening stock"
                }));
            }
        }

        // The owner starts each drawer with float money so cash in hand is never zero.
        foreach (var shop in shops)
        {
            db.PettyCashEntries.Add(New(new PettyCashEntry
            {
                ShopId = shop.Id,
                EntryDate = opened,
                Direction = PettyCashDirection.In,
                Amount = 150000m,
                Note = "Opening cash float",
                IsSystemGenerated = false
            }));
        }

        await db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    private async Task SeedPurchasesAsync(
        List<Shop> shops,
        List<Supplier> suppliers,
        List<Product> products,
        CancellationToken ct)
    {
        var sequence = 1;

        for (var monthsAgo = 5; monthsAgo >= 0; monthsAgo--)
        {
            foreach (var shop in shops)
            {
                var billDate = MonthDay(monthsAgo, Rng.Next(3, 24));
                if (billDate > Now)
                {
                    continue;
                }

                var supplier = suppliers[Rng.Next(suppliers.Count)];
                var lines = Enumerable.Range(0, Rng.Next(2, 5))
                    .Select(_ => products[Rng.Next(products.Count)])
                    .DistinctBy(p => p.Id)
                    .Select(p => new PurchaseItem { ProductId = p.Id, Qty = Rng.Next(2, 9), UnitCost = p.CostPrice })
                    .ToList();

                var total = lines.Sum(l => l.Qty * l.UnitCost);
                var paid = Rng.Next(0, 10) < 6 ? total : decimal.Round(total * 0.5m, 2);

                var bill = New(new PurchaseBill
                {
                    BillNo = $"{shop.Code}-P{billDate:yyyyMM}-{sequence++:D4}",
                    ShopId = shop.Id,
                    SupplierId = supplier.Id,
                    BillDate = billDate,
                    Total = total,
                    PaidAmount = paid,
                    PaymentMethod = PaymentMethod.Bank
                });

                foreach (var line in lines)
                {
                    bill.Items.Add(line);
                }

                db.PurchaseBills.Add(bill);
                await db.SaveChangesAsync(ct).ConfigureAwait(false);

                foreach (var line in lines)
                {
                    await AddStockAsync(shop.Id, line.ProductId, line.Qty, StockMovementType.Purchase,
                        line.UnitCost, bill.BillNo, billDate, ct).ConfigureAwait(false);
                }

                if (paid > 0)
                {
                    db.SupplierPayments.Add(New(new SupplierPayment
                    {
                        ShopId = shop.Id,
                        SupplierId = supplier.Id,
                        PurchaseBillId = bill.Id,
                        PaidAt = billDate,
                        Amount = paid,
                        Method = PaymentMethod.Bank,
                        Note = $"Paid with bill {bill.BillNo}"
                    }));
                }

                await db.SaveChangesAsync(ct).ConfigureAwait(false);
            }
        }
    }

    private async Task SeedSalesAsync(
        List<Shop> shops,
        List<Customer> customers,
        List<Product> products,
        List<AppUser> users,
        CancellationToken ct)
    {
        var tills = users.Where(u => u.Role == UserRole.Standard).Select(u => u.Username).ToList();
        var sequence = 1;

        // Six months of history, denser over the last 30 days so the daily chart is full.
        for (var daysAgo = 180; daysAgo >= 0; daysAgo--)
        {
            var date = Now.AddDays(-daysAgo);
            var salesToday = daysAgo <= 30 ? Rng.Next(2, 6) : Rng.Next(0, 3);

            for (var n = 0; n < salesToday; n++)
            {
                var shop = shops[Rng.Next(shops.Count)];
                var customer = Rng.Next(0, 10) < 6 ? customers[0] : customers[Rng.Next(1, customers.Count)];

                var lines = Enumerable.Range(0, Rng.Next(1, 4))
                    .Select(_ => products[Rng.Next(products.Count)])
                    .DistinctBy(p => p.Id)
                    .Select(p => new SalesItem
                    {
                        ProductId = p.Id,
                        Qty = Rng.Next(1, 4),
                        UnitPrice = p.SalePrice,
                        UnitCost = p.CostPrice
                    })
                    .ToList();

                var available = new List<SalesItem>();
                foreach (var line in lines)
                {
                    var onHand = await db.StockLevels
                        .Where(s => s.ShopId == shop.Id && s.ProductId == line.ProductId)
                        .Select(s => s.Qty)
                        .FirstOrDefaultAsync(ct)
                        .ConfigureAwait(false);

                    if (onHand >= line.Qty)
                    {
                        available.Add(line);
                    }
                }

                if (available.Count == 0)
                {
                    continue;
                }

                var subTotal = available.Sum(l => l.Qty * l.UnitPrice);
                var discount = Rng.Next(0, 10) < 3 ? decimal.Round(subTotal * 0.03m, 2) : 0m;
                var total = subTotal - discount;

                var method = customer.IsWalkIn
                    ? (Rng.Next(0, 10) < 6 ? PaymentMethod.Cash : PaymentMethod.Card)
                    : (PaymentMethod)Rng.Next(1, 5);

                var paid = customer.IsWalkIn
                    ? total
                    : method == PaymentMethod.Credit
                        ? (Rng.Next(0, 10) < 5 ? 0m : decimal.Round(total * 0.4m, 2))
                        : total;

                var invoice = New(new SalesInvoice
                {
                    InvoiceNo = $"{shop.Code}-{date:yyyyMM}-{sequence++:D4}",
                    ShopId = shop.Id,
                    CustomerId = customer.Id,
                    InvoiceDate = date,
                    SubTotal = subTotal,
                    Discount = discount,
                    Total = total,
                    PaidAmount = paid,
                    PaymentMethod = method,
                    Status = paid <= 0 ? InvoiceStatus.Unpaid : paid >= total ? InvoiceStatus.Paid : InvoiceStatus.Partial
                }, tills.Count > 0 ? tills[Rng.Next(tills.Count)] : "admin");

                foreach (var line in available)
                {
                    invoice.Items.Add(line);
                }

                db.SalesInvoices.Add(invoice);
                await db.SaveChangesAsync(ct).ConfigureAwait(false);

                foreach (var line in available)
                {
                    await AddStockAsync(shop.Id, line.ProductId, -line.Qty, StockMovementType.Sale,
                        line.UnitCost, invoice.InvoiceNo, date, ct).ConfigureAwait(false);
                }

                if (paid > 0)
                {
                    db.CustomerPayments.Add(New(new CustomerPayment
                    {
                        ShopId = shop.Id,
                        CustomerId = customer.Id,
                        SalesInvoiceId = invoice.Id,
                        ReceivedAt = date,
                        Amount = paid,
                        Method = method,
                        Note = $"Received with invoice {invoice.InvoiceNo}"
                    }));

                    if (method == PaymentMethod.Cash)
                    {
                        db.PettyCashEntries.Add(New(new PettyCashEntry
                        {
                            ShopId = shop.Id,
                            EntryDate = date,
                            Direction = PettyCashDirection.In,
                            Amount = paid,
                            Note = $"Cash sale {invoice.InvoiceNo}",
                            IsSystemGenerated = true
                        }));
                    }
                }

                await db.SaveChangesAsync(ct).ConfigureAwait(false);
            }
        }
    }

    private async Task SeedExpensesAsync(List<Shop> shops, List<ExpenseCategory> categories, CancellationToken ct)
    {
        for (var monthsAgo = 5; monthsAgo >= 0; monthsAgo--)
        {
            foreach (var shop in shops)
            {
                foreach (var category in categories)
                {
                    if (Rng.Next(0, 10) < 3)
                    {
                        continue;
                    }

                    var date = MonthDay(monthsAgo, Rng.Next(1, 27));
                    if (date > Now)
                    {
                        continue;
                    }

                    var amount = category.Name switch
                    {
                        "Rent" => 85000m,
                        "Salaries" => decimal.Round(120000m + Rng.Next(0, 40000), 2),
                        "Utilities" => decimal.Round(18000m + Rng.Next(0, 12000), 2),
                        _ => decimal.Round(4000m + Rng.Next(0, 16000), 2)
                    };

                    var method = category.Name is "Rent" or "Salaries" ? PaymentMethod.Bank : PaymentMethod.Cash;

                    var expense = New(new Expense
                    {
                        ShopId = shop.Id,
                        ExpenseCategoryId = category.Id,
                        ExpenseDate = date,
                        Amount = amount,
                        Method = method,
                        Note = $"{category.Name} for {date:MMM yyyy}"
                    });

                    db.Expenses.Add(expense);
                    await db.SaveChangesAsync(ct).ConfigureAwait(false);

                    if (method == PaymentMethod.Cash)
                    {
                        db.PettyCashEntries.Add(New(new PettyCashEntry
                        {
                            ShopId = shop.Id,
                            EntryDate = date,
                            Direction = PettyCashDirection.Out,
                            Amount = amount,
                            ExpenseId = expense.Id,
                            Note = expense.Note,
                            IsSystemGenerated = true
                        }));

                        await db.SaveChangesAsync(ct).ConfigureAwait(false);
                    }
                }
            }
        }
    }

    private async Task AddStockAsync(
        long shopId,
        long productId,
        int signedQty,
        StockMovementType type,
        decimal unitCost,
        string reference,
        DateTime movedAt,
        CancellationToken ct)
    {
        var level = await db.StockLevels
            .FirstOrDefaultAsync(s => s.ShopId == shopId && s.ProductId == productId, ct)
            .ConfigureAwait(false);

        if (level is null)
        {
            level = new StockLevel { ShopId = shopId, ProductId = productId, Qty = 0 };
            db.StockLevels.Add(level);
        }

        level.Qty += signedQty;

        db.StockMovements.Add(New(new StockMovement
        {
            ShopId = shopId,
            ProductId = productId,
            Type = type,
            Qty = signedQty,
            UnitCost = unitCost,
            MovedAt = movedAt,
            Reference = reference
        }));
    }

    private static DateTime Now => DateTime.UtcNow;

    private static DateTime MonthDay(int monthsAgo, int day)
    {
        var month = new DateTime(Now.Year, Now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-monthsAgo);
        var safeDay = Math.Min(day, DateTime.DaysInMonth(month.Year, month.Month));
        return month.AddDays(safeDay - 1).AddHours(Rng.Next(9, 19));
    }

    private static T New<T>(T entity, string by = "seed")
        where T : Domain.Common.AuditableEntity
    {
        entity.CreatedAt = Now;
        entity.CreatedBy = by;
        return entity;
    }
}
