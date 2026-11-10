using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Common.Interfaces;
using TechTill.Domain.Entities;
using TechTill.Domain.Enums;

namespace TechTill.Application.Features.Auth;

public sealed class AuthService(
    IAppDbContext db,
    IPasswordHasher hasher,
    IJwtTokenService tokens,
    IPermissionService permissions,
    IAuditService audit,
    ICurrentUser currentUser,
    ICacheService cache,
    IDateTimeProvider clock)
{
    private const int MaxSignInFailures = 10;

    private static string? _decoyHash;

    private static string DecoyHash(IPasswordHasher hasher)
        => _decoyHash ??= hasher.Hash(Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24)));

    private static readonly TimeSpan SignInLockWindow = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ReuseGrace = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ClockSkewAllowance = TimeSpan.FromMinutes(1);

    public async Task<AuthResult> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        // Keyed by address too, so someone guessing from elsewhere cannot lock the owner out.
        var failures = CacheKeys.SignInFailures(request.Username, currentUser.Ip);

        if (cache.CountOf(failures) >= MaxSignInFailures)
        {
            throw new TooManyRequestsException("Too many failed attempts for this account. Try again in 15 minutes.");
        }

        var user = await db.Users
            .Include(u => u.UserShops).ThenInclude(us => us.Shop)
            .Include(u => u.Permissions)
            .FirstOrDefaultAsync(u => u.Username == request.Username && !u.IsDeleted, ct)
            .ConfigureAwait(false);

        // Always pay for one hash check, so the response time does not reveal which usernames exist.
        var passwordMatches = hasher.Verify(request.Password, user?.PasswordHash ?? DecoyHash(hasher));

        if (user is null || !user.IsActive || !passwordMatches)
        {
            cache.Increment(failures, SignInLockWindow);

            await audit.LogAsync(
                Module.Users,
                AuditAction.LoginFailed,
                nameof(AppUser),
                user?.Id,
                $"Failed login for '{request.Username}'",
                usernameOverride: request.Username,
                ct: ct).ConfigureAwait(false);

            throw new ForbiddenException("Invalid username or password.");
        }

        cache.Remove(failures);
        user.LastLoginAt = clock.UtcNow;
        var result = await IssueAsync(user, ct).ConfigureAwait(false);

        await audit.LogAsync(
            Module.Users,
            AuditAction.Login,
            nameof(AppUser),
            user.Id,
            $"Login for '{user.Username}'",
            usernameOverride: user.Username,
            ct: ct).ConfigureAwait(false);

        return result;
    }

    public async Task<AuthResult> RefreshAsync(RefreshRequest request, CancellationToken ct = default)
    {
        var hash = RefreshTokenHash.Of(request.RefreshToken ?? string.Empty);
        var stored = await db.RefreshTokens
            .Include(t => t.User).ThenInclude(u => u.UserShops).ThenInclude(us => us.Shop)
            .Include(t => t.User).ThenInclude(u => u.Permissions)
            .FirstOrDefaultAsync(t => t.Token == hash, ct)
            .ConfigureAwait(false);

        // A token already rotated away is being used again: someone else holds a copy. Two tabs
        // refreshing together look the same for a moment, so a short grace period applies.
        if (stored?.RevokedAt is { } revokedAt && clock.UtcNow - revokedAt > ReuseGrace)
        {
            await EndEverySessionAsync(stored.User, ct).ConfigureAwait(false);
            throw new ForbiddenException("The refresh token is no longer valid.");
        }

        if (stored is null || stored.RevokedAt is not null || stored.ExpiresAt <= clock.UtcNow || !stored.User.IsActive)
        {
            throw new ForbiddenException("The refresh token is no longer valid.");
        }

        stored.RevokedAt = clock.UtcNow;
        return await IssueAsync(stored.User, ct).ConfigureAwait(false);
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            var hash = RefreshTokenHash.Of(refreshToken);
            var stored = await db.RefreshTokens
                .FirstOrDefaultAsync(t => t.Token == hash, ct)
                .ConfigureAwait(false);

            // Only the caller's own session; someone else's token value proves nothing about them.
            if (stored is not null && stored.UserId == currentUser.UserId)
            {
                stored.RevokedAt = clock.UtcNow;
            }
        }

        // Only this token: the same account signed in on another device stays signed in.
        if (currentUser.TokenId is { } tokenId)
        {
            cache.Mark(CacheKeys.EndedToken(tokenId), tokens.AccessTokenLifetime.Add(ClockSkewAllowance));
        }

        await audit.LogAsync(Module.Users, AuditAction.Logout, nameof(AppUser), currentUser.UserId, ct: ct)
            .ConfigureAwait(false);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? throw new ForbiddenException("Not signed in.");
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct).ConfigureAwait(false)
            ?? throw new NotFoundException(nameof(AppUser), userId);

        if (!hasher.Verify(request.CurrentPassword, user.PasswordHash))
        {
            throw ValidationFailedException.ForField(nameof(request.CurrentPassword), "The current password is not correct.");
        }

        if (request.NewPassword.Length < 8)
        {
            throw ValidationFailedException.ForField(nameof(request.NewPassword), "Use at least 8 characters.");
        }

        user.PasswordHash = hasher.Hash(request.NewPassword);
        user.TokenVersion++;
        user.UpdatedAt = clock.UtcNow;
        user.UpdatedBy = currentUser.Username;

        // A password change invalidates every outstanding session for that user.
        var active = await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync(ct).ConfigureAwait(false);
        active.ForEach(t => t.RevokedAt = clock.UtcNow);

        await audit.LogAsync(Module.Users, AuditAction.PasswordChange, nameof(AppUser), userId, ct: ct)
            .ConfigureAwait(false);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        permissions.Invalidate(userId);
    }

    public async Task<UserProfile> MeAsync(CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? throw new ForbiddenException("Not signed in.");
        var user = await db.Users
            .Include(u => u.UserShops).ThenInclude(us => us.Shop)
            .Include(u => u.Permissions)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            .ConfigureAwait(false) ?? throw new NotFoundException(nameof(AppUser), userId);

        return await BuildProfileAsync(user, ct).ConfigureAwait(false);
    }

    private async Task<AuthResult> IssueAsync(AppUser user, CancellationToken ct)
    {
        var access = tokens.CreateAccessToken(user);
        var raw = tokens.CreateRefreshToken();

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            Token = RefreshTokenHash.Of(raw),
            CreatedAt = clock.UtcNow,
            ExpiresAt = clock.UtcNow.Add(tokens.RefreshTokenLifetime)
        });
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        var profile = await BuildProfileAsync(user, ct).ConfigureAwait(false);
        return new AuthResult(access.Token, access.ExpiresAt, raw, profile);
    }

    private async Task EndEverySessionAsync(AppUser user, CancellationToken ct)
    {
        var active = await db.RefreshTokens
            .Where(t => t.UserId == user.Id && t.RevokedAt == null)
            .ToListAsync(ct).ConfigureAwait(false);
        active.ForEach(t => t.RevokedAt = clock.UtcNow);
        user.TokenVersion++;

        await audit.LogAsync(
            Module.Users,
            AuditAction.Logout,
            nameof(AppUser),
            user.Id,
            "Refresh token reused, every session ended",
            usernameOverride: user.Username,
            ct: ct).ConfigureAwait(false);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        permissions.Invalidate(user.Id);
    }

    private async Task<UserProfile> BuildProfileAsync(AppUser user, CancellationToken ct)
    {
        var shopIds = await permissions.AllowedShopIdsAsync(user.Id, ct).ConfigureAwait(false);
        var shops = await db.Shops
            .Where(s => shopIds.Contains(s.Id) && s.IsActive && !s.IsDeleted)
            .OrderBy(s => s.Name)
            .Select(s => new ShopRef(s.Id, s.Code, s.Name))
            .ToListAsync(ct).ConfigureAwait(false);

        var map = await permissions.GetPermissionsAsync(user.Id, ct).ConfigureAwait(false);
        var perms = map
            .Select(kv => new ModulePermission(kv.Key, kv.Value.Read, kv.Value.Write))
            .OrderBy(p => p.Module)
            .ToList();

        return new UserProfile(user.Id, user.Username, user.FullName, user.Role, shops, perms);
    }
}
