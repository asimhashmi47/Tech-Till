using TechTill.Domain.Common;
using TechTill.Domain.Enums;

namespace TechTill.Domain.Entities;

public class Shop : AuditableEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<UserShop> UserShops { get; set; } = [];
}

public class AppUser : AuditableEntity
{
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Standard;
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }

    public ICollection<UserShop> UserShops { get; set; } = [];
    public ICollection<UserPermission> Permissions { get; set; } = [];
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}

public class UserShop
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public long ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
}

public class UserPermission
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public Module Module { get; set; }
    public bool CanRead { get; set; }
    public bool CanWrite { get; set; }
}

public class RefreshToken
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public bool IsActive => RevokedAt is null && ExpiresAt > DateTime.UtcNow;
}

/// <summary>
/// A single application wide setting, stored as a key and a value so the table does not
/// need a migration every time a new option appears. Only the owner can change these.
/// </summary>
public class AppSetting : AuditableEntity
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

public class AuditLog
{
    public long Id { get; set; }
    public DateTime At { get; set; }
    public long? UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public long? ShopId { get; set; }
    public Module Module { get; set; }
    public AuditAction Action { get; set; }
    public string Entity { get; set; } = string.Empty;
    public long? EntityId { get; set; }
    public string? Summary { get; set; }
    public string? Ip { get; set; }
    public string? CorrelationId { get; set; }
}
