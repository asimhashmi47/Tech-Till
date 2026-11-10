using System.Globalization;

namespace TechTill.Application.Common.Interfaces;

/// <summary>Cache key groups. Groups let a single write invalidate every related entry.</summary>
public static class CacheKeys
{
    public const string Lookups = "lookups";
    public const string Dashboard = "dashboard";
    public const string Permissions = "permissions";

    public static string Permission(long userId) => $"{Permissions}:user:{userId}";
    public static string AllowedShops(long userId) => $"{Permissions}:shops:{userId}";
    public static string Session(long userId) => $"{Permissions}:session:{userId}";
    public static string EndedToken(string tokenId) => $"ended-token:{tokenId}";
    public static string SignInFailures(string username, string? ip) => $"sign-in-failures:{ip}:{username.Trim().ToLowerInvariant()}";
    public static string Dashboards(long? shopId, long userId) => $"{Dashboard}:{userId}:{shopId?.ToString(CultureInfo.InvariantCulture) ?? "all"}";
    public static string Lookup(string name) => $"{Lookups}:{name}";
}
