using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
using Serilog;
using TechTill.Api.Middleware;
using TechTill.Api.Security;
using TechTill.Application.Common.Interfaces;
using TechTill.Application.Common.Query;
using TechTill.Infrastructure;
using TechTill.Infrastructure.Persistence;
using TechTill.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

// No endpoint takes a file, so nothing legitimate comes near this.
const long MaxRequestBytes = 1_048_576;
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = MaxRequestBytes);

builder.Host.UseSerilog((context, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext());

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();

builder.Services
    .AddControllers(options =>
    {
        options.SuppressAsyncSuffixInActionNames = false;

        // Model validation walks these trees before the action runs, and a deep one fails
        // with a 500. Their size is checked by QueryLimits, so validation can skip them.
        options.ModelMetadataDetailsProviders.Add(new SuppressChildValidationMetadataProvider(typeof(FilterGroup)));
    })
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

// Model binding failures are returned in the same ProblemDetails shape as everything else.
builder.Services.Configure<ApiBehaviorOptions>(options =>
    options.InvalidModelStateResponseFactory = context => new BadRequestObjectResult(
        new ValidationProblemDetails(context.ModelState)
        {
            Title = "Validation failed",
            Detail = "Please correct the highlighted fields.",
            Instance = context.HttpContext.Request.Path,
            Extensions = { ["correlationId"] = context.HttpContext.TraceIdentifier }
        }));

var jwt = new JwtOptions();
builder.Configuration.GetSection(JwtOptions.SectionName).Bind(jwt);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
        options.Events = new JwtBearerEvents { OnTokenValidated = SessionValidation.ValidateAsync };
    });

builder.Services.AddAuthorization();

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? ["http://localhost:4200"];

builder.Services.AddCors(options => options.AddPolicy("angular", policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithExposedHeaders("Content-Disposition")));

// Per address, so one source can never use up everybody's sign-ins. AuthService also locks
// a single account after repeated failures from one address.
var signInLimit = builder.Configuration.GetValue("RateLimits:SignInPerIpPerMinute", 60);
var refreshLimit = builder.Configuration.GetValue("RateLimits:RefreshPerIpPerMinute", 120);

static RateLimitPartition<string> PerAddress(HttpContext context, int limit)
    => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { Window = TimeSpan.FromMinutes(1), PermitLimit = limit, QueueLimit = 0 });

// Every signed-in user also gets a budget, and a much smaller one for Excel exports, which
// load and format up to 50,000 rows each.
var requestsPerUser = builder.Configuration.GetValue("RateLimits:RequestsPerUserPerMinute", 600);
var exportsPerUser = builder.Configuration.GetValue("RateLimits:ExportsPerUserPerMinute", 10);

static RateLimitPartition<string> PerUser(string key, int limit)
    => RateLimitPartition.GetFixedWindowLimiter(
        key,
        _ => new FixedWindowRateLimiterOptions { Window = TimeSpan.FromMinutes(1), PermitLimit = limit, QueueLimit = 0 });

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var userId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (userId is null)
        {
            return RateLimitPartition.GetNoLimiter("anonymous");
        }

        return context.Request.Path.Value?.EndsWith("/export", StringComparison.OrdinalIgnoreCase) == true
            ? PerUser($"export:{userId}", exportsPerUser)
            : PerUser($"user:{userId}", requestsPerUser);
    });
    options.AddPolicy("login", context => PerAddress(context, signInLimit));
    options.AddPolicy("refresh", context => PerAddress(context, refreshLimit));
});

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "TechTill API",
            Version = "v1",
            Description = "Inventory, POS and books for computer shops."
        });

        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Paste the access token returned by /api/auth/login."
        });

        options.AddSecurityRequirement(_ => new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference("Bearer")] = []
        });
    });
}

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();

// Kestrel enforces the limit while reading; this answers declared oversize bodies at once,
// and covers hosts that do not apply Kestrel's limit.
app.Use(async (context, next) =>
{
    if (context.Request.ContentLength > MaxRequestBytes)
    {
        context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
        return;
    }

    // A chunked body declares no length, so it is read up to the limit first.
    if (context.Request.ContentLength is null && context.Request.Body.CanRead && HttpMethods.IsPost(context.Request.Method) | HttpMethods.IsPut(context.Request.Method))
    {
        var buffered = new MemoryStream();
        var chunk = new byte[16_384];
        int read;
        while ((read = await context.Request.Body.ReadAsync(chunk, context.RequestAborted).ConfigureAwait(false)) > 0)
        {
            if (buffered.Length + read > MaxRequestBytes)
            {
                context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                return;
            }

            buffered.Write(chunk, 0, read);
        }

        buffered.Position = 0;
        context.Request.Body = buffered;
        context.Response.RegisterForDispose(buffered);
    }

    await next(context).ConfigureAwait(false);
});
app.UseSerilogRequestLogging();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "TechTill API v1"));
}
else
{
    app.UseHsts();
}

app.UseCors("angular");
// After authentication, so the per-user budget can see who is calling.
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "ok", at = DateTime.UtcNow })).AllowAnonymous();

// SQLite in WAL mode handles a handful of tills comfortably. Migrations run on start; a new
// database gets the demo seed in Development and only the owner account everywhere else.
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;").ConfigureAwait(false);

    var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
    await seeder
        .InitialiseAsync(app.Environment.IsDevelopment(), app.Configuration["Bootstrap:AdminPassword"])
        .ConfigureAwait(false);
}

await app.RunAsync().ConfigureAwait(false);
