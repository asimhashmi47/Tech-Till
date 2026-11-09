using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Interfaces;

namespace TechTill.Application.Features.Auth;

/// <summary>
/// A signed token cannot be recalled, so every request checks it against the account. The
/// answer is cached and dropped through IPermissionService.Invalidate whenever an account
/// changes, which makes a deactivation or demotion take effect on the very next request.
/// </summary>
public sealed class SessionGuard(IAppDbContext db, ICacheService cache)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);

    public async Task<bool> IsCurrentAsync(long userId, int tokenVersion, string? tokenId, CancellationToken ct = default)
    {
        if (tokenId is not null && cache.IsMarked(CacheKeys.EndedToken(tokenId)))
        {
            return false;
        }

        var account = await cache.GetOrCreateAsync(
            CacheKeys.Session(userId),
            () => db.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new AccountState(u.IsActive && !u.IsDeleted, u.TokenVersion))
                .FirstOrDefaultAsync(ct),
            Ttl).ConfigureAwait(false);

        return account is { Active: true } && account.TokenVersion == tokenVersion;
    }

    private sealed record AccountState(bool Active, int TokenVersion);
}
