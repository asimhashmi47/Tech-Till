using System.Security.Cryptography;
using System.Text;

namespace TechTill.Application.Features.Auth;

/// <summary>
/// Refresh tokens are 48 random bytes, so a plain SHA-256 is enough: there is nothing to
/// brute force. Only the hash is stored, so a copy of the database holds no live sessions.
/// </summary>
public static class RefreshTokenHash
{
    public static string Of(string token)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
