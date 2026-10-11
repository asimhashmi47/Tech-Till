using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TechTill.Application.Features.Auth;

namespace TechTill.Api.Controllers;

public sealed class AuthController(AuthService auth) : ApiControllerBase
{
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("login")]
    public Task<AuthResult> Login(LoginRequest request, CancellationToken ct)
        => auth.LoginAsync(request, ct);

    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("refresh")]
    public Task<AuthResult> Refresh(RefreshRequest request, CancellationToken ct)
        => auth.RefreshAsync(request, ct);

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest? request, CancellationToken ct)
    {
        await auth.LogoutAsync(request?.RefreshToken, ct).ConfigureAwait(false);
        return NoContent();
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        await auth.ChangePasswordAsync(request, ct).ConfigureAwait(false);
        return NoContent();
    }

    [HttpGet("me")]
    public Task<UserProfile> Me(CancellationToken ct) => auth.MeAsync(ct);
}
