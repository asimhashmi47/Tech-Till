using System.Net.Mime;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using TechTill.Application.Common.Exceptions;

namespace TechTill.Api.Middleware;

/// <summary>
/// Turns every unhandled exception into an RFC 7807 ProblemDetails response carrying the
/// correlation id. Stack traces are only included outside production.
/// </summary>
public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger,
    IHostEnvironment environment)
{
    private static readonly Action<ILogger, string, string, Exception> LogFailure =
        LoggerMessage.Define<string, string>(
            LogLevel.Error,
            new EventId(1000, "RequestFailed"),
            "Request {Path} failed with correlation id {CorrelationId}");

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            await WriteAsync(context, ex).ConfigureAwait(false);
        }
    }

    private async Task WriteAsync(HttpContext context, Exception exception)
    {
        if (context.Response.HasStarted)
        {
            LogFailure(logger, context.Request.Path, context.TraceIdentifier, exception);
            return;
        }

        var (status, title, detail, errors) = Map(exception);

        if (status >= StatusCodes.Status500InternalServerError)
        {
            LogFailure(logger, context.Request.Path, context.TraceIdentifier, exception);
        }

        ProblemDetails problem = errors is null
            ? new ProblemDetails
            {
                Status = status,
                Title = title,
                Detail = detail,
                Instance = context.Request.Path
            }
            : new ValidationProblemDetails(errors)
            {
                Status = status,
                Title = title,
                Detail = detail,
                Instance = context.Request.Path
            };

        problem.Extensions["correlationId"] = context.TraceIdentifier;

        if (!environment.IsProduction() && status >= StatusCodes.Status500InternalServerError)
        {
            problem.Extensions["exception"] = exception.ToString();
        }

        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = MediaTypeNames.Application.Json;

        // Serialise against the runtime type. Passing the declared ProblemDetails type
        // would silently drop the Errors dictionary on a validation failure.
        await context.Response
            .WriteAsync(JsonSerializer.Serialize(problem, problem.GetType(), JsonOptions))
            .ConfigureAwait(false);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static (int Status, string Title, string Detail, IDictionary<string, string[]>? Errors) Map(Exception ex)
        => ex switch
        {
            ValidationFailedException v =>
                (StatusCodes.Status400BadRequest, "Validation failed", "Please correct the highlighted fields.", v.Errors),
            NotFoundException n =>
                (StatusCodes.Status404NotFound, "Not found", n.Message, null),
            ForbiddenException f =>
                (StatusCodes.Status403Forbidden, "Forbidden", f.Message, null),
            ConflictException c =>
                (StatusCodes.Status409Conflict, "Conflict", c.Message, null),
            OperationCanceledException =>
                (StatusCodesExtra.Status499ClientClosedRequest, "Request cancelled", "The request was cancelled.", null),
            _ =>
                (StatusCodes.Status500InternalServerError, "Server error",
                    "Something went wrong on our side. Quote the correlation id when reporting it.", null)
        };
}

internal static class StatusCodesExtra
{
    public const int Status499ClientClosedRequest = 499;
}
