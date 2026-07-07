namespace PosProbe.Gateway.Middlewares;

/// <summary>
/// US-PROBE-002: Intercepts requests matching /api/pos/* and tags them
/// with an internal X-POS-Traffic header for downstream identification.
/// The request continues to the legacy gateway unmodified.
/// </summary>
public class PosTrafficTaggingMiddleware
{
    private const string PosTrafficHeader = "X-POS-Traffic";
    private const string PosPathPrefix = "/api/pos/";
    private readonly RequestDelegate _next;
    private readonly ILogger<PosTrafficTaggingMiddleware> _logger;

    public PosTrafficTaggingMiddleware(RequestDelegate next, ILogger<PosTrafficTaggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        if (path.StartsWith(PosPathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            // Tag the request as POS traffic for downstream identification
            context.Request.Headers[PosTrafficHeader] = "true";

            _logger.LogDebug(
                "POS traffic identified: {Method} {Path} [Correlation: {CorrelationId}]",
                context.Request.Method,
                path,
                context.Request.Headers["X-Correlation-ID"].ToString());
        }

        await _next(context);
    }
}
