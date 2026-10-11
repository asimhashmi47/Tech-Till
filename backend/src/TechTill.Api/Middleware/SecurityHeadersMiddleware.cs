namespace TechTill.Api.Middleware;

/// <summary>
/// Sets the Content Security Policy and the companion security headers. Inline styles are
/// the only inline source allowed, which Angular needs for its component styles. Fonts and
/// icons ship with the app rather than coming from a CDN, so no external origin is listed.
/// </summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next, IHostEnvironment environment)
{
    private const string Policy =
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "object-src 'none'";

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;

        // Swagger UI in development needs its own inline bootstrap, so the strict policy is
        // applied to the application and the API surface, not to the docs page.
        var isSwagger = context.Request.Path.StartsWithSegments("/swagger", StringComparison.OrdinalIgnoreCase);

        if (!isSwagger)
        {
            headers["Content-Security-Policy"] = Policy;
        }

        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        headers["Cross-Origin-Opener-Policy"] = "same-origin";

        if (environment.IsProduction())
        {
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
        }

        await next(context).ConfigureAwait(false);
    }
}
