using TechTill.Application.Common.Exceptions;
using TechTill.Application.Features.Users;
using TechTill.Domain.Enums;

namespace TechTill.UnitTests;

/// <summary>A plain edit used to be able to lock the business out of its own system (F08).</summary>
public class LastOwnerTests
{
    private static SaveUserRequest Edit(string username, UserRole role, bool active)
        => new(username, "Shop Owner", role, active, null, [], []);

    [Theory]
    [Trait("AC", "USR-04")]
    [InlineData(UserRole.Standard, true)]
    [InlineData(UserRole.Admin, false)]
    [InlineData(UserRole.Standard, false)]
    public async Task TheOnlyOwner_CannotBeDemotedOrDeactivated(UserRole role, bool active)
    {
        using var app = new TestApp();

        await Assert.ThrowsAsync<ConflictException>(() => app.Users.UpdateAsync(app.AdminId, Edit("admin", role, active)));

        var stored = app.Saved().Users.Single(u => u.Id == app.AdminId);
        Assert.Equal(UserRole.Admin, stored.Role);
        Assert.True(stored.IsActive);
    }

    [Fact]
    [Trait("AC", "USR-04")]
    public async Task TheOnlyOwner_CanStillBeRenamed()
    {
        using var app = new TestApp();

        var result = await app.Users.UpdateAsync(app.AdminId, Edit("owner", UserRole.Admin, true));

        Assert.Equal("owner", result.Username);
    }

    [Fact]
    [Trait("AC", "USR-04")]
    public async Task AnOwner_CanBeDemoted_WhenAnotherActiveOwnerRemains()
    {
        using var app = new TestApp();
        var second = await app.Users.CreateAsync(new SaveUserRequest("second", "Second Owner", UserRole.Admin, true, "second-pass-1", [], []));

        var result = await app.Users.UpdateAsync(app.AdminId, Edit("admin", UserRole.Standard, true));

        Assert.Equal(UserRole.Standard, result.Role);
        await Assert.ThrowsAsync<ConflictException>(() => app.Users.UpdateAsync(second.Id, Edit("second", UserRole.Standard, true)));
    }

    [Fact]
    [Trait("AC", "USR-04")]
    public async Task AnInactiveOwner_DoesNotCountAsTheRemainingOwner()
    {
        using var app = new TestApp();
        var second = await app.Users.CreateAsync(new SaveUserRequest("second", "Second Owner", UserRole.Admin, false, "second-pass-1", [], []));

        await Assert.ThrowsAsync<ConflictException>(() => app.Users.UpdateAsync(app.AdminId, Edit("admin", UserRole.Standard, true)));
        Assert.False(second.IsActive);
    }
}
