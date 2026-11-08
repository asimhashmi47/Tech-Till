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
            Username = usernameOverride ?? currentUser.Username,
            ShopId = shopId,
            Module = module,
            Action = action,
            Entity = entity,
            EntityId = entityId,
            Summary = Trim(summary),
            Ip = currentUser.Ip,
            CorrelationId = currentUser.CorrelationId
        });

        await db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    private static string? Trim(string? value)
        => value is null || value.Length <= 1000 ? value : value[..1000];
}
