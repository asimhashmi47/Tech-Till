using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TechTill.Application.Common.Interfaces;
using TechTill.Domain.Enums;

namespace TechTill.Api.Security;

/// <summary>
/// Backend enforcement of the per-module access matrix. The Angular guards hide the same
/// routes, but this attribute is what actually stops a request, including a direct API call
/// made with a lower privilege token.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequirePermissionAttribute(Module module, Access access)
    : Attribute, IAsyncAuthorizationFilter
{
    public Module Module { get; } = module;

    public Access Access { get; } = access;

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var services = context.HttpContext.RequestServices;
        var currentUser = services.GetRequiredService<ICurrentUser>();

        if (currentUser.UserId is not { } userId)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        if (currentUser.IsAdmin)
        {
            return;
        }

        var permissions = services.GetRequiredService<IPermissionService>();
        var allowed = await permissions
            .HasAccessAsync(userId, Module, Access, context.HttpContext.RequestAborted)
            .ConfigureAwait(false);

        if (!allowed)
        {
            context.Result = new ObjectResult(new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Forbidden",
                Detail = $"Your account does not have {Access} access to {Module}.",
                Instance = context.HttpContext.Request.Path
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
    }
}

/// <summary>Shorthand for the two admin only modules.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AdminOnlyAttribute : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var currentUser = context.HttpContext.RequestServices.GetRequiredService<ICurrentUser>();

        if (currentUser.UserId is null)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        if (!currentUser.IsAdmin)
        {
            context.Result = new ObjectResult(new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Forbidden",
                Detail = "This area is restricted to the owner account.",
                Instance = context.HttpContext.Request.Path
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
    }
}
