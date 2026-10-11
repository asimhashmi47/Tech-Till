using System.Globalization;
using System.Security.Claims;
using TechTill.Application.Common.Interfaces;
using TechTill.Domain.Enums;

namespace TechTill.Api.Security;

/// <summary>Reads the signed in identity from the request. There is no other source of truth.</summary>
public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public long? UserId
    {
        get
        {
            var raw = Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return long.TryParse(raw, CultureInfo.InvariantCulture, out var id) ? id : null;
        }
    }

    public string Username => Principal?.FindFirst(ClaimTypes.Name)?.Value ?? "anonymous";

    public UserRole? Role
        => Enum.TryParse<UserRole>(Principal?.FindFirst(ClaimTypes.Role)?.Value, out var role) ? role : null;

    public bool IsAdmin => Role == UserRole.Admin;

    public string? Ip => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();

    public string? CorrelationId => accessor.HttpContext?.TraceIdentifier;

    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;
}
