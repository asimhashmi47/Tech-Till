using TechTill.Domain.Entities;

namespace TechTill.Application.Common.Interfaces;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}

public sealed record AccessToken(string Token, DateTime ExpiresAt);

public interface IJwtTokenService
{
    AccessToken CreateAccessToken(AppUser user);
    string CreateRefreshToken();
    TimeSpan RefreshTokenLifetime { get; }
}
