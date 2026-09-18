using Polly;
using Polly.Extensions.Http;
using PosProbe.Gateway.Middlewares;
using PosProbe.Gateway.Services;

// ── Load .env file ──
DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);

// ── YARP Reverse Proxy ──
// Override cluster destinations from environment variables
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
{
    ["ReverseProxy:Clusters:legacy-gateway-cluster:Destinations:legacy-gateway:Address"] =
        Environment.GetEnvironmentVariable("LEGACY_GATEWAY_URL") ?? "http://localhost:5001",
    ["ReverseProxy:Clusters:ai-service-cluster:Destinations:ai-service:Address"] =
        Environment.GetEnvironmentVariable("AI_SERVICE_URL") ?? "http://localhost:8000",
});

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

// ── CORS ──
var allowedOrigins = (Environment.GetEnvironmentVariable("ALLOWED_ORIGINS") ?? "http://localhost:3003,http://localhost:3004,http://localhost:3006")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

// If ALLOWED_ORIGINS contains "*", allow any origin (demo-friendly).
// The dashboard authenticates with a Bearer token (not cookies), so we do NOT
// need AllowCredentials — and requiring it breaks CORS when the origin isn't an
// exact byte-for-byte match. Only enable credentials for explicit named origins.
var allowAnyOrigin = allowedOrigins.Length == 0 || allowedOrigins.Contains("*");

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontends", policy =>
    {
        if (allowAnyOrigin)
        {
            policy.SetIsOriginAllowed(_ => true)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
        else
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
    });
});

// ── US-PROBE-018: Anomaly detection pipeline ──
builder.Services.AddSingleton<AnomalyCloneChannel>();
builder.Services.AddHostedService<AnomalyForwarderService>();

// HTTP client for AI service with Polly retry policy
var aiServiceUrl = Environment.GetEnvironmentVariable("AI_SERVICE_URL") ?? "http://localhost:8000";
builder.Services.AddHttpClient("AiService", client =>
{
    client.BaseAddress = new Uri(aiServiceUrl);
    client.Timeout = TimeSpan.FromSeconds(5);
})
.AddPolicyHandler(HttpPolicyExtensions
    .HandleTransientHttpError()
    .WaitAndRetryAsync(2, retryAttempt => TimeSpan.FromMilliseconds(200 * retryAttempt)));

var app = builder.Build();

// ── Middleware Pipeline ──
app.UseWebSockets(); // US-PROBE-025: Enable WebSocket proxying
app.UseCors("AllowFrontends");

// US-PROBE-002: Correlation ID + POS traffic tagging
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<PosTrafficTaggingMiddleware>();

// US-PROBE-018: Clone high-risk transactions for anomaly detection
app.UseMiddleware<TransactionCloningMiddleware>();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new
{
    service = "pos-probe-gateway",
    status = "healthy",
    timestamp = DateTime.UtcNow
})).RequireCors("AllowFrontends");

// YARP reverse proxy — CORS must be attached to the proxied routes explicitly,
// otherwise /api/probe/* responses are returned without Access-Control headers
// and the browser blocks them (preflight passes, real request fails).
app.MapReverseProxy().RequireCors("AllowFrontends");

// ── Determine port ──
// Cloud hosts (Render, Koyeb, Railway) inject PORT. Fall back to GATEWAY_PORT, then 5020.
// Bind to 0.0.0.0 so the service is reachable from outside the container.
var port = Environment.GetEnvironmentVariable("PORT")
    ?? Environment.GetEnvironmentVariable("GATEWAY_PORT")
    ?? "5020";
app.Urls.Add($"http://0.0.0.0:{port}");

app.Run();
