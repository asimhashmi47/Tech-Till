using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TechTill.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
[Produces("application/json")]
public abstract class ApiControllerBase : ControllerBase
{
    private const string ExcelContentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    protected FileContentResult Excel(byte[] content, string name)
        => File(content, ExcelContentType, $"{name}-{DateTime.UtcNow:yyyyMMdd-HHmm}.xlsx");
}
