using TechTill.Application.Common.Exceptions;
using TechTill.Application.Features.Auth;

namespace TechTill.UnitTests;

/// <summary>An unknown username used to fail in 5 ms against 167 ms for a real one (F10).</summary>
public class SignInTimingTests
{
    [Theory]
    [Trait("AC", "AUTH-14")]
    [InlineData("no-such-user")]
    [InlineData("staff")]
    public async Task EveryFailedSignIn_DoesThePasswordCheck(string username)
    {
        using var app = new TestApp();
        if (username == "staff")
        {
            app.Saved().Users.Single(u => u.Username == "staff").IsActive = false;
            await app.Db.SaveChangesAsync();
        }

        app.AsNobody();
        var before = app.Hasher.VerifyCalls;

        await Assert.ThrowsAsync<ForbiddenException>(() => app.Auth.LoginAsync(new LoginRequest(username, TestApp.Password)));

        Assert.Equal(before + 1, app.Hasher.VerifyCalls);
    }
}
