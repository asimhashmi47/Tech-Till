using TechTill.Application.Common.Query;
using TechTill.Domain.Enums;

namespace TechTill.Application.Common.Interfaces;

public interface ICurrentUser
{
    long? UserId { get; }
    string Username { get; }
    UserRole? Role { get; }
    bool IsAdmin { get; }
    string? Ip { get; }
    string? CorrelationId { get; }
}

public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}

public interface IPermissionService
{
    Task<bool> HasAccessAsync(long userId, Module module, Access access, CancellationToken ct = default);

    /// <summary>Shop ids the user may read. Admin returns every active shop.</summary>
    Task<IReadOnlyList<long>> AllowedShopIdsAsync(long userId, CancellationToken ct = default);

    Task<IReadOnlyDictionary<Module, (bool Read, bool Write)>> GetPermissionsAsync(long userId, CancellationToken ct = default);

    void Invalidate(long userId);
}

public interface IAuditService
{
    Task LogAsync(
        Module module,
        AuditAction action,
        string entity,
        long? entityId = null,
        string? summary = null,
        long? shopId = null,
        string? usernameOverride = null,
        CancellationToken ct = default);
}

public interface ICacheService
{
    Task<T> GetOrCreateAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null);
    void Remove(string key);

    /// <summary>Drops every cached entry under a logical group, for example dashboard aggregates.</summary>
    void RemoveGroup(string group);
}

public interface IExcelExportService
{
    byte[] Build<T>(string sheetName, IReadOnlyList<T> rows, QuerySpec<T> spec, IEnumerable<string> columns);
}

public interface IShopScope
{
    /// <summary>
    /// Resolves the shop ids a request may touch. Throws when the caller asks for a shop
    /// outside its assignment, so scoping is enforced in the query layer and not only the UI.
    /// </summary>
    Task<IReadOnlyList<long>> ResolveAsync(long? requestedShopId, CancellationToken ct = default);

    Task EnsureWritableAsync(long shopId, CancellationToken ct = default);
}
