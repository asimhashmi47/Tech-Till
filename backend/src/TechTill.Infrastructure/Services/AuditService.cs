using TechTill.Application.Common.Interfaces;
using TechTill.Domain.Entities;
using TechTill.Domain.Enums;
using TechTill.Infrastructure.Persistence;

namespace TechTill.Infrastructure.Services;

/// <summary>
/// Single writer for the audit trail. Services log once their own change has been committed,
/// so the row is saved here: nothing after this call would otherwise persist it.
/// </summary>
public sealed class AuditService(AppDbContext db, ICurrentUser currentUser, IDateTimeProvider clock) : IAuditService
{
    public async Task LogAsync(
        Module module,
        AuditAction action,
        string entity,
        long? entityId = null,
        string? summary = null,
        long? shopId = null,
        string? usernameOverride = null,
        CancellationToken ct = default)
    {
        db.AuditLogs.Add(new AuditLog
        {
            At = clock.UtcNow,
            UserId = currentUser.UserId,
            // A failed sign-in records whatever was typed, so it is cut to the column's length.
            Username = Cut(usernameOverride ?? currentUser.Username, 60)!,
            ShopId = shopId,
            Module = module,
            Action = action,
            Entity = entity,
            EntityId = entityId,
            Summary = Cut(summary, 1000),
            Ip = Cut(currentUser.Ip, 60),
            CorrelationId = Cut(currentUser.CorrelationId, 60)
        });

        await db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    private static string? Cut(string? value, int max)
        => value is null || value.Length <= max ? value : value[..max];
}
