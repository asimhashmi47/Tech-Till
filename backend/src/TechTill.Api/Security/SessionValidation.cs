using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using TechTill.Application.Common.Interfaces;
using TechTill.Application.Features.Auth;

namespace TechTill.Api.Security;

/// <summary>Runs after the signature check, so a valid but withdrawn token still gets 401.</summary>
public static class SessionValidation
{
    public static async Task ValidateAsync(TokenValidatedContext context)
    {
        // Logging out only ever gives something up, and has to stay safe to repeat.
        if (context.Request.Path.StartsWithSegments("/api/auth/logout", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var principal = context.Principal!;
        var parsed = long.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, CultureInfo.InvariantCulture, out var userId);
        _ = int.TryParse(principal.FindFirst(SessionClaims.TokenVersion)?.Value, CultureInfo.InvariantCulture, out var version);
        var tokenId = principal.FindFirst(SessionClaims.TokenId)?.Value;

        var guard = context.HttpContext.RequestServices.GetRequiredService<SessionGuard>();
        var current = parsed && await guard
            .IsCurrentAsync(userId, version, tokenId, context.HttpContext.RequestAborted)
            .ConfigureAwait(false);

        if (!current)
        {
            context.Fail("This session has ended.");
        }
    }
}
