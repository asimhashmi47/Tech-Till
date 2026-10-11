using TechTill.Domain.Enums;

namespace TechTill.Application.Features.Auth;

public sealed record LoginRequest(string Username, string Password);

public sealed record RefreshRequest(string RefreshToken);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record ShopRef(long Id, string Code, string Name);

public sealed record ModulePermission(Module Module, bool CanRead, bool CanWrite);

public sealed record UserProfile(
    long Id,
    string Username,
    string FullName,
    UserRole Role,
    IReadOnlyList<ShopRef> Shops,
    IReadOnlyList<ModulePermission> Permissions);

public sealed record AuthResult(
    string AccessToken,
    DateTime AccessTokenExpiresAt,
    string RefreshToken,
    UserProfile User);
