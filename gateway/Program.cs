using PosProbe.Gateway.Middlewares;

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

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontends", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// ── Middleware Pipeline ──
app.UseCors("AllowFrontends");

// US-PROBE-002: Correlation ID + POS traffic tagging
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<PosTrafficTaggingMiddleware>();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new
{
    service = "pos-probe-gateway",
    status = "healthy",
    timestamp = DateTime.UtcNow
}));

// YARP reverse proxy
app.MapReverseProxy();

// ── Determine port ──
var port = Environment.GetEnvironmentVariable("GATEWAY_PORT") ?? "5020";
app.Urls.Add($"http://localhost:{port}");

app.Run();
