using TechTill.Application.Features.Auth;

namespace TechTill.UnitTests;

/// <summary>Any session could revoke another user's refresh token at logout (F21).</summary>
public class LogoutOwnershipTests
{
    [Fact]
    [Trait("AC", "AUTH-16")]
    public async Task Logout_OnlyRevokesTheCallersOwnToken()
    {
        using var app = new TestApp();
        app.AsNobody();
        var staff = await app.Auth.LoginAsync(new LoginRequest("staff", TestApp.Password));

        app.AsAdmin();
        await app.Auth.LogoutAsync(staff.RefreshToken);

        app.AsNobody();
        var refreshed = await app.Auth.RefreshAsync(new RefreshRequest(staff.RefreshToken));
        Assert.NotNull(refreshed.AccessToken);
    }
}
