using Microsoft.AspNetCore.Mvc;
using TechTill.Api.Security;
using TechTill.Application.Features.Settings;

namespace TechTill.Api.Controllers;

public sealed class SettingsController(SettingsService settings) : ApiControllerBase
{
    /// <summary>
    /// Readable by every signed in account, because the whole app formats money with it.
    /// </summary>
    [HttpGet]
    public Task<AppSettingsDto> Get(CancellationToken ct) => settings.GetAsync(ct);

    [AdminOnly]
    [HttpPut]
    public Task<AppSettingsDto> Update(SaveSettingsRequest request, CancellationToken ct)
        => settings.UpdateAsync(request, ct);
}
