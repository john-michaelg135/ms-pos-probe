namespace PosProbe.Gateway.Middlewares;

/// <summary>
/// US-PROBE-002: Injects an X-Correlation-ID header into every request
/// for distributed tracing across the gateway, legacy API, and AI service.
/// </summary>
public class CorrelationIdMiddleware
{
    private const string CorrelationIdHeader = "X-Correlation-ID";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Use existing correlation ID if provided, otherwise generate a new one
        if (!context.Request.Headers.ContainsKey(CorrelationIdHeader))
        {
            context.Request.Headers[CorrelationIdHeader] = Guid.NewGuid().ToString("N");
        }

        var correlationId = context.Request.Headers[CorrelationIdHeader].ToString();

        // Add to response headers for traceability
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[CorrelationIdHeader] = correlationId;
            return Task.CompletedTask;
        });

        await _next(context);
    }
}
