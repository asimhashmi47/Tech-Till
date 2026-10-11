using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;
using TechTill.Application.Common.Interfaces;
using TechTill.Domain.Entities;

namespace TechTill.Infrastructure.Services;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "TechTill";
    public string Audience { get; set; } = "TechTill";
    public string Secret { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 30;
    public int RefreshTokenDays { get; set; } = 7;
}

public sealed class JwtTokenService(JwtOptions options, IDateTimeProvider clock) : IJwtTokenService
{
    public TimeSpan RefreshTokenLifetime => TimeSpan.FromDays(options.RefreshTokenDays);

    public AccessToken CreateAccessToken(AppUser user)
    {
        var expires = clock.UtcNow.AddMinutes(options.AccessTokenMinutes);
        var key = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(options.Secret));

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Subject, user.Id.ToString(CultureInfo.InvariantCulture)),
            new(ClaimTypes.NameIdentifier, user.Id.ToString(CultureInfo.InvariantCulture)),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, user.Role.ToString()),
            new("fullName", user.FullName),
            new(JwtRegisteredClaimNames.JwtId, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims: claims,
            notBefore: clock.UtcNow,
            expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new AccessToken(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }

    public string CreateRefreshToken()
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));

    private static class JwtRegisteredClaimNames
    {
        public const string Subject = "sub";
        public const string JwtId = "jti";
    }
}
