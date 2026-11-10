using TechTill.Application.Features.Auth;
using TechTill.Application.Features.Users;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>Eight characters was the only rule, and an admin reset left old sessions alive (F22).</summary>
public class PasswordPolicyTests
{
    [Theory]
    [Trait("AC", "USR-05")]
    [InlineData("password1")]
    [InlineData("12345678")]
    [InlineData("TechTill#2026")]
    [InlineData("newstaff")]
    public async Task CommonOrObviousPasswords_AreRefused_OnCreate(string password)
    {
        using var app = new TestApp();

        await Expect.InvalidAsync("Password", () => app.Users.CreateAsync(
            new SaveUserRequest("newstaff", "New Staff", UserRole.Standard, true, password, [], [])));
    }

    [Fact]
    [Trait("AC", "USR-05")]
    public async Task CommonPasswords_AreRefused_OnChange()
    {
        using var app = new TestApp();
        app.AsStaff();

        await Expect.InvalidAsync("NewPassword", () => app.Auth.ChangePasswordAsync(new ChangePasswordRequest(TestApp.Password, "qwerty123")));
    }

    [Fact]
    [Trait("AC", "USR-05")]
    public async Task APasswordOverTheLimit_IsRefused()
    {
        using var app = new TestApp();

        await Expect.InvalidAsync("Password", () => app.Users.CreateAsync(
            new SaveUserRequest("newstaff", "New Staff", UserRole.Standard, true, new string('x', 129), [], [])));
    }

    [Fact]
    [Trait("AC", "USR-05")]
    public async Task AnAdminReset_EndsTheUsersSessions()
    {
        using var app = new TestApp();
        app.AsNobody();
        var session = await app.Auth.LoginAsync(new LoginRequest("staff", TestApp.Password));

        app.AsAdmin();
        await app.Users.UpdateAsync(app.StaffId, new SaveUserRequest("staff", "Sara Khan", UserRole.Standard, true, "a-fresh-start-2", [app.ShopA], []));

        Assert.True(app.Saved().Users.Single(u => u.Id == app.StaffId).TokenVersion > 0);
        app.AsNobody();
        await Assert.ThrowsAsync<TechTill.Application.Common.Exceptions.ForbiddenException>(
            () => app.Auth.RefreshAsync(new RefreshRequest(session.RefreshToken)));
    }
}
