using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TechTill.Application.Common.Exceptions;
using TechTill.Application.Features.Auth;
using TechTill.Domain.Entities;
using TechTill.Domain.Enums;
using TechTill.Infrastructure;
using TechTill.Infrastructure.Services;

namespace TechTill.UnitTests;

public sealed class AuthServiceTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    private Task<AuthResult> LoginAsync(string username = "staff", string password = TestApp.Password)
        => _app.Auth.LoginAsync(new LoginRequest(username, password));

    [Fact]
    [Trait("AC", "AUTH-01")]
    public async Task Login_ValidCredentials_ReturnsTokensAndProfile()
    {
        var result = await LoginAsync();

        Assert.False(string.IsNullOrWhiteSpace(result.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(result.RefreshToken));
        Assert.Equal("staff", result.User.Username);
        Assert.Equal(TestApp.Now.AddMinutes(30), result.AccessTokenExpiresAt);
    }

    [Fact]
    [Trait("AC", "AUTH-01")]
    public async Task Login_ValidCredentials_RecordsLastLoginAndAudit()
    {
        await LoginAsync();

        var db = _app.Saved();
        Assert.Equal(TestApp.Now, (await db.Users.SingleAsync(u => u.Id == _app.StaffId)).LastLoginAt);
        Assert.Single(db.AuditLogs.Where(a => a.Action == AuditAction.Login && a.Username == "staff"));
    }

    [Theory]
    [Trait("AC", "AUTH-02")]
    [InlineData("staff", "wrong")]
    [InlineData("nobody", TestApp.Password)]
    [InlineData("", "")]
    [InlineData("' OR 1=1 --", "x")]
    public async Task Login_BadCredentials_FailWithTheSameMessageAndAudit(string username, string password)
    {
        var error = await Assert.ThrowsAsync<ForbiddenException>(() => LoginAsync(username, password));

        Assert.Equal("Invalid username or password.", error.Message);
        Assert.Single(_app.Saved().AuditLogs.Where(a => a.Action == AuditAction.LoginFailed));
    }

    [Fact]
    [Trait("AC", "AUTH-02")]
    public async Task Login_InactiveUser_IsRefused()
    {
        var user = await _app.Db.Users.SingleAsync(u => u.Id == _app.StaffId);
        user.IsActive = false;
        await _app.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ForbiddenException>(() => LoginAsync());
    }

    [Fact]
    [Trait("AC", "AUTH-02")]
    public async Task Login_DeletedUser_IsRefused()
    {
        var user = await _app.Db.Users.SingleAsync(u => u.Id == _app.StaffId);
        user.IsDeleted = true;
        await _app.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ForbiddenException>(() => LoginAsync());
    }

    [Fact]
    [Trait("AC", "AUTH-03")]
    public async Task Refresh_ValidToken_IssuesNewPairAndRevokesOld()
    {
        var first = await LoginAsync();

        var second = await _app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken));

        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
        var old = await _app.Saved().RefreshTokens.SingleAsync(t => t.Token == first.RefreshToken);
        Assert.NotNull(old.RevokedAt);
    }

    [Fact]
    [Trait("AC", "AUTH-03")]
    public async Task Refresh_BeforeExpiryByTheInjectedClock_Succeeds()
    {
        var first = await LoginAsync();
        _app.Clock.UtcNow = TestApp.Now.AddDays(6);

        var second = await _app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken));

        Assert.NotNull(second.RefreshToken);
    }

    [Fact]
    [Trait("AC", "AUTH-04")]
    public Task Refresh_UnknownToken_IsRefused()
        => Assert.ThrowsAsync<ForbiddenException>(() => _app.Auth.RefreshAsync(new RefreshRequest("nope")));

    [Fact]
    [Trait("AC", "AUTH-04")]
    public async Task Refresh_AlreadyUsedToken_IsRefused()
    {
        var first = await LoginAsync();
        await _app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken));

        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken)));
    }

    [Fact]
    [Trait("AC", "AUTH-04")]
    public async Task Refresh_ExpiredByTheInjectedClock_IsRefused()
    {
        var first = await LoginAsync();
        _app.Clock.UtcNow = TestApp.Now.AddDays(8);

        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken)));
    }

    [Fact]
    [Trait("AC", "AUTH-04")]
    public async Task Refresh_InactiveUser_IsRefused()
    {
        var first = await LoginAsync();
        var user = await _app.Db.Users.SingleAsync(u => u.Id == _app.StaffId);
        user.IsActive = false;
        await _app.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Auth.RefreshAsync(new RefreshRequest(first.RefreshToken)));
    }

    [Fact]
    [Trait("AC", "AUTH-05")]
    public async Task Logout_WithToken_RevokesItAndAudits()
    {
        var login = await LoginAsync();
        _app.AsStaff();

        await _app.Auth.LogoutAsync(login.RefreshToken);

        var db = _app.Saved();
        Assert.NotNull((await db.RefreshTokens.SingleAsync(t => t.Token == login.RefreshToken)).RevokedAt);
        Assert.Single(db.AuditLogs.Where(a => a.Action == AuditAction.Logout));
    }

    [Theory]
    [Trait("AC", "AUTH-05")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("unknown")]
    public async Task Logout_MissingOrUnknownToken_DoesNotFail(string? token)
    {
        _app.AsStaff();
        await _app.Auth.LogoutAsync(token);
        Assert.Single(_app.Saved().AuditLogs.Where(a => a.Action == AuditAction.Logout));
    }

    [Fact]
    [Trait("AC", "AUTH-06")]
    public async Task ChangePassword_Valid_RehashesAndRevokesEverySession()
    {
        var a = await LoginAsync();
        var b = await LoginAsync();
        _app.AsStaff();

        await _app.Auth.ChangePasswordAsync(new ChangePasswordRequest(TestApp.Password, "a-new-password"));

        var db = _app.Saved();
        Assert.Equal(_app.Hasher.Hash("a-new-password"), (await db.Users.SingleAsync(u => u.Id == _app.StaffId)).PasswordHash);
        Assert.All(db.RefreshTokens.Where(t => t.Token == a.RefreshToken || t.Token == b.RefreshToken), t => Assert.NotNull(t.RevokedAt));
        Assert.Single(db.AuditLogs.Where(l => l.Action == AuditAction.PasswordChange));
    }

    [Fact]
    [Trait("AC", "AUTH-06")]
    public Task ChangePassword_WrongCurrent_IsRejected()
    {
        _app.AsStaff();
        return Expect.InvalidAsync("CurrentPassword", () => _app.Auth.ChangePasswordAsync(new ChangePasswordRequest("nope", "a-new-password")));
    }

    [Theory]
    [Trait("AC", "AUTH-06")]
    [InlineData("")]
    [InlineData("1234567")]
    public Task ChangePassword_TooShort_IsRejected(string next)
    {
        _app.AsStaff();
        return Expect.InvalidAsync("NewPassword", () => _app.Auth.ChangePasswordAsync(new ChangePasswordRequest(TestApp.Password, next)));
    }

    [Fact]
    [Trait("AC", "AUTH-06")]
    public Task ChangePassword_NotSignedIn_IsRefused()
    {
        _app.AsNobody();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Auth.ChangePasswordAsync(new ChangePasswordRequest("a", "b")));
    }

    [Fact]
    [Trait("AC", "AUTH-06")]
    public Task ChangePassword_UserGone_IsNotFound()
    {
        _app.User.UserId = 9999;
        return Assert.ThrowsAsync<NotFoundException>(() => _app.Auth.ChangePasswordAsync(new ChangePasswordRequest("a", "b")));
    }

    [Fact]
    [Trait("AC", "AUTH-07")]
    public async Task Me_Staff_ListsOnlyAssignedActiveShops()
    {
        _app.AsStaff();

        var me = await _app.Auth.MeAsync();

        Assert.Equal([_app.ShopA], me.Shops.Select(s => s.Id));
        Assert.Contains(me.Permissions, p => p.Module == Module.Pos && p.CanWrite);
    }

    [Fact]
    [Trait("AC", "AUTH-07")]
    public async Task Me_InactiveShop_IsLeftOut()
    {
        var shop = await _app.Db.Shops.SingleAsync(s => s.Id == _app.ShopA);
        shop.IsActive = false;
        await _app.Db.SaveChangesAsync();
        _app.AsStaff();

        Assert.Empty((await _app.Auth.MeAsync()).Shops);
    }

    [Fact]
    [Trait("AC", "AUTH-07")]
    public Task Me_NotSignedIn_IsRefused()
    {
        _app.AsNobody();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Auth.MeAsync());
    }

    [Fact]
    [Trait("AC", "AUTH-07")]
    public Task Me_UserGone_IsNotFound()
    {
        _app.User.UserId = 9999;
        return Assert.ThrowsAsync<NotFoundException>(() => _app.Auth.MeAsync());
    }
}

public sealed class TokenAndHasherTests
{
    [Fact]
    [Trait("AC", "AUTH-08")]
    public void CreateAccessToken_CarriesIdentityRoleAndExpiry()
    {
        using var app = new TestApp();
        var user = new AppUser { Id = 7, Username = "sara", FullName = "Sara Khan", Role = UserRole.Standard };

        var token = app.Tokens.CreateAccessToken(user);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.Token);

        Assert.Equal("7", jwt.Claims.First(c => c.Type == "sub").Value);
        Assert.Equal("sara", jwt.Claims.First(c => c.Type == ClaimTypes.Name).Value);
        Assert.Equal("Standard", jwt.Claims.First(c => c.Type == ClaimTypes.Role).Value);
        Assert.Equal("HS256", jwt.Header.Alg);
        Assert.Equal(TestApp.Now.AddMinutes(30), token.ExpiresAt);
        Assert.DoesNotContain(jwt.Claims, c => c.Value.Contains("hash", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    [Trait("AC", "AUTH-08")]
    public void CreateRefreshToken_IsLongAndUnique()
    {
        using var app = new TestApp();
        var tokens = Enumerable.Range(0, 50).Select(_ => app.Tokens.CreateRefreshToken()).ToList();

        Assert.Equal(50, tokens.Distinct().Count());
        Assert.All(tokens, t => Assert.Equal(48, Convert.FromBase64String(t).Length));
    }

    [Fact]
    [Trait("AC", "AUTH-06")]
    public void Bcrypt_HashThenVerify_RoundTrips()
    {
        var hasher = new BcryptPasswordHasher();
        var hash = hasher.Hash("pässwörd-🔐");

        Assert.NotEqual("pässwörd-🔐", hash);
        Assert.True(hasher.Verify("pässwörd-🔐", hash));
        Assert.False(hasher.Verify("other", hash));
    }

    [Fact]
    [Trait("AC", "AUTH-02")]
    public void Bcrypt_MalformedStoredHash_IsAFailedMatchNotACrash()
        => Assert.False(new BcryptPasswordHasher().Verify("x", "not-a-hash"));

    [Theory]
    [Trait("AC", "AUTH-10")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("short-secret")]
    public void AddInfrastructure_MissingOrShortSecret_RefusesToStart(string secret)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Secret"] = secret })
            .Build();

        Assert.Throws<InvalidOperationException>(() => new ServiceCollection().AddInfrastructure(configuration));
    }

    [Fact]
    [Trait("AC", "AUTH-10")]
    public void AddInfrastructure_LongEnoughSecret_RegistersServices()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Secret"] = new string('k', 32) })
            .Build();

        Assert.NotEmpty(new ServiceCollection().AddInfrastructure(configuration));
    }
}

public sealed class PermissionTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    [Fact]
    [Trait("AC", "PERM-01")]
    public async Task Admin_HasEveryModuleAndEveryShop()
    {
        foreach (var module in Enum.GetValues<Module>())
        {
            Assert.True(await _app.Permissions.HasAccessAsync(_app.AdminId, module, Access.Write));
        }

        Assert.Equal(2, (await _app.Permissions.AllowedShopIdsAsync(_app.AdminId)).Count);
    }

    [Fact]
    [Trait("AC", "PERM-01")]
    public async Task Admin_DoesNotGetDeletedShops()
    {
        var shop = await _app.Db.Shops.SingleAsync(s => s.Id == _app.ShopB);
        shop.IsDeleted = true;
        await _app.Db.SaveChangesAsync();

        Assert.Equal([_app.ShopA], await _app.Permissions.AllowedShopIdsAsync(_app.AdminId));
    }

    [Theory]
    [Trait("AC", "PERM-02")]
    [InlineData(Module.Pos, Access.Read, true)]
    [InlineData(Module.Pos, Access.Write, true)]
    [InlineData(Module.Invoices, Access.Read, true)]
    [InlineData(Module.Invoices, Access.Write, false)]
    [InlineData(Module.Reports, Access.Read, false)]
    [InlineData(Module.Reports, Access.Write, false)]
    public async Task Standard_GetsExactlyTheirMatrix(Module module, Access access, bool expected)
        => Assert.Equal(expected, await _app.Permissions.HasAccessAsync(_app.StaffId, module, access));

    [Fact]
    [Trait("AC", "PERM-02")]
    public async Task Standard_WriteWithoutReadRow_StillReads()
    {
        _app.Db.UserPermissions.Add(new UserPermission { UserId = _app.StaffId, Module = Module.Stock, CanRead = false, CanWrite = true });
        await _app.Db.SaveChangesAsync();

        Assert.True(await _app.Permissions.HasAccessAsync(_app.StaffId, Module.Stock, Access.Read));
    }

    [Theory]
    [Trait("AC", "PERM-03")]
    [InlineData(Module.Users)]
    [InlineData(Module.AuditLog)]
    public async Task Standard_StoredRowForAdminModule_IsIgnored(Module module)
    {
        _app.Db.UserPermissions.Add(new UserPermission { UserId = _app.StaffId, Module = module, CanRead = true, CanWrite = true });
        await _app.Db.SaveChangesAsync();

        Assert.False(await _app.Permissions.HasAccessAsync(_app.StaffId, module, Access.Read));
    }

    [Fact]
    [Trait("AC", "PERM-04")]
    public async Task Scope_NoShopRequested_ReturnsAssignedShops()
    {
        _app.AsStaff();
        Assert.Equal([_app.ShopA], await _app.Scope.ResolveAsync(null));
    }

    [Fact]
    [Trait("AC", "PERM-04")]
    public async Task Scope_AssignedShop_ReturnsOnlyThatShop()
    {
        _app.AsStaff();
        Assert.Equal([_app.ShopA], await _app.Scope.ResolveAsync(_app.ShopA));
    }

    [Fact]
    [Trait("AC", "PERM-04")]
    public Task Scope_ShopOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Scope.ResolveAsync(_app.ShopB));
    }

    [Fact]
    [Trait("AC", "PERM-04")]
    public Task Scope_WriteOutsideAssignment_IsRefused()
    {
        _app.AsStaff();
        return Assert.ThrowsAsync<ForbiddenException>(() => _app.Scope.EnsureWritableAsync(_app.ShopB));
    }

    [Fact]
    [Trait("AC", "PERM-04")]
    public async Task Scope_NotSignedIn_IsRefused()
    {
        _app.AsNobody();
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Scope.ResolveAsync(null));
        await Assert.ThrowsAsync<ForbiddenException>(() => _app.Scope.EnsureWritableAsync(_app.ShopA));
    }

    [Fact]
    [Trait("AC", "PERM-05")]
    public async Task Invalidate_AfterChange_MakesItEffectiveImmediately()
    {
        Assert.False(await _app.Permissions.HasAccessAsync(_app.StaffId, Module.Reports, Access.Read));
        _app.Db.UserPermissions.Add(new UserPermission { UserId = _app.StaffId, Module = Module.Reports, CanRead = true });
        await _app.Db.SaveChangesAsync();
        Assert.False(await _app.Permissions.HasAccessAsync(_app.StaffId, Module.Reports, Access.Read));

        _app.Permissions.Invalidate(_app.StaffId);

        Assert.True(await _app.Permissions.HasAccessAsync(_app.StaffId, Module.Reports, Access.Read));
    }

    [Fact]
    [Trait("AC", "PERM-05")]
    public async Task Cache_RemoveGroup_DropsEveryEntryInTheGroup()
    {
        var calls = 0;
        Task<int> Factory() => Task.FromResult(++calls);

        await _app.Cache.GetOrCreateAsync("g:one", Factory);
        await _app.Cache.GetOrCreateAsync("g:one", Factory);
        Assert.Equal(1, calls);

        _app.Cache.RemoveGroup("g");
        _app.Cache.RemoveGroup("missing");
        await _app.Cache.GetOrCreateAsync("g:one", Factory);

        Assert.Equal(2, calls);
    }
}
