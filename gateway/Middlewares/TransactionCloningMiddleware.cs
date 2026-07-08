using System.Text.Json;
using PosProbe.Gateway.Services;

namespace PosProbe.Gateway.Middlewares;

/// <summary>
/// US-PROBE-018: Identifies high-risk POS endpoints (refunds, new orders,
/// stock adjustments) and clones the transaction payload into the Channel
/// for async anomaly evaluation. The cashier's response is NEVER delayed.
/// </summary>
public class TransactionCloningMiddleware
{
    private readonly RequestDelegate _next;
    private readonly AnomalyCloneChannel _channel;
    private readonly ILogger<TransactionCloningMiddleware> _logger;

    // Endpoints that trigger cloning (high-risk POS actions)
    private static readonly string[] _highRiskPaths =
    [
        "/api/pos/orders",          // New order creation
        "/api/pos/refunds",         // Refund requests
        "/api/pos/stock-adjustment" // Stock adjustments
    ];

    public TransactionCloningMiddleware(
        RequestDelegate next,
        AnomalyCloneChannel channel,
        ILogger<TransactionCloningMiddleware> logger)
    {
        _next = next;
        _channel = channel;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var method = context.Request.Method;

        // Only clone POST requests to high-risk endpoints
        bool shouldClone = method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && _highRiskPaths.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));

        if (!shouldClone)
        {
            await _next(context);
            return;
        }

        // Read and buffer the request body (so it can be read twice)
        context.Request.EnableBuffering();
        string? bodyContent = null;

        using (var reader = new StreamReader(context.Request.Body, leaveOpen: true))
        {
            bodyContent = await reader.ReadToEndAsync();
            context.Request.Body.Position = 0; // Reset for downstream
        }

        // Let the legacy request proceed immediately
        await _next(context);

        // Only clone if the legacy response was successful (2xx)
        if (context.Response.StatusCode >= 200 && context.Response.StatusCode < 300 && bodyContent != null)
        {
            try
            {
                var payload = ExtractPayload(bodyContent, path);
                if (payload != null)
                {
                    // Fire-and-forget: push into the bounded channel
                    _channel.Writer.TryWrite(payload);
                    _logger.LogDebug("Cloned transaction for anomaly check: {Path} → order {OrderId}", path, payload.OrderId);
                }
            }
            catch (Exception ex)
            {
                // Never fail the POS response due to cloning errors
                _logger.LogWarning(ex, "Failed to clone transaction payload from {Path}", path);
            }
        }
    }

    private static TransactionPayload? ExtractPayload(string body, string path)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            var now = DateTime.UtcNow;
            var orderId = root.TryGetProperty("orderId", out var oid) ? oid.ToString()
                        : root.TryGetProperty("order_id", out var oid2) ? oid2.ToString()
                        : Guid.NewGuid().ToString("N")[..8];

            var totalAmount = root.TryGetProperty("totalAmount", out var ta) ? ta.GetDecimal()
                            : root.TryGetProperty("total_amount", out var ta2) ? ta2.GetDecimal()
                            : 0m;

            var quantity = root.TryGetProperty("quantity", out var q) ? q.GetInt32()
                         : root.TryGetProperty("quantityToReturn", out var qr) ? qr.GetInt32()
                         : 1;

            var discountAmount = root.TryGetProperty("discountAmount", out var da) ? da.GetDecimal() : 0m;
            var discountType = root.TryGetProperty("discountType", out var dt) ? dt.GetString() : null;

            var isRefund = path.Contains("refund", StringComparison.OrdinalIgnoreCase);

            var cashierId = root.TryGetProperty("cashierId", out var cid) ? cid.ToString()
                          : root.TryGetProperty("submittedBy", out var sb) ? sb.ToString()
                          : null;

            var locationId = root.TryGetProperty("locationId", out var lid) ? lid.GetInt32() : (int?)null;

            return new TransactionPayload(
                OrderId: orderId,
                TotalAmount: totalAmount,
                Quantity: quantity,
                DiscountAmount: discountAmount,
                DiscountType: discountType,
                HourOfDay: now.Hour,
                DayOfWeek: (int)now.DayOfWeek,
                IsRefund: isRefund,
                CashierId: cashierId,
                CashierName: null,
                LocationId: locationId,
                LocationName: null
            );
        }
        catch
        {
            return null;
        }
    }
}
