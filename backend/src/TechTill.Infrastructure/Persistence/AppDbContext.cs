using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Common.Interfaces;
using TechTill.Domain.Entities;

namespace TechTill.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IAppDbContext
{
    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<UserShop> UserShops => Set<UserShop>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();

    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<StockLevel> StockLevels => Set<StockLevel>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();

    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseBill> PurchaseBills => Set<PurchaseBill>();
    public DbSet<PurchaseItem> PurchaseItems => Set<PurchaseItem>();
    public DbSet<SupplierPayment> SupplierPayments => Set<SupplierPayment>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<SalesInvoice> SalesInvoices => Set<SalesInvoice>();
    public DbSet<SalesItem> SalesItems => Set<SalesItem>();
    public DbSet<CustomerPayment> CustomerPayments => Set<CustomerPayment>();

    public DbSet<ExpenseCategory> ExpenseCategories => Set<ExpenseCategory>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<PettyCashEntry> PettyCashEntries => Set<PettyCashEntry>();

    public new Task<int> SaveChangesAsync(CancellationToken ct = default)
        => base.SaveChangesAsync(ct);

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        EnforceTextLengths();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnforceTextLengths();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <summary>
    /// SQLite stores any length whatever the column says, so the declared limits are enforced
    /// here, once, for every write rather than in each service.
    /// </summary>
    private void EnforceTextLengths()
    {
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified))
            {
                continue;
            }

            foreach (var property in entry.Properties)
            {
                if (property.Metadata.GetMaxLength() is { } max
                    && property.CurrentValue is string text
                    && text.Length > max)
                {
                    throw ValidationFailedException.ForField(
                        property.Metadata.Name,
                        $"Use at most {max} characters.");
                }
            }
        }
    }

    public async Task<IAppTransaction> BeginTransactionAsync(CancellationToken ct = default)
    {
        // A nested call reuses the ambient transaction so services can compose freely.
        if (Database.CurrentTransaction is not null)
        {
            return new NestedTransaction();
        }

        return new EfTransaction(await Database.BeginTransactionAsync(ct).ConfigureAwait(false));
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }

    private sealed class EfTransaction(IDbContextTransaction inner) : IAppTransaction
    {
        public Task CommitAsync(CancellationToken ct = default) => inner.CommitAsync(ct);

        public ValueTask DisposeAsync() => inner.DisposeAsync();
    }

    private sealed class NestedTransaction : IAppTransaction
    {
        public Task CommitAsync(CancellationToken ct = default) => Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
