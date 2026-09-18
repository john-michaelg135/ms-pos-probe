using System.Net.Http.Json;

namespace PosProbe.Gateway.Services;

/// <summary>
/// US-PROBE-018: Background service that consumes the Channel queue and
/// forwards cloned payloads to the FastAPI anomaly detection endpoint.
/// Runs independently — cashier terminal is never blocked.
/// </summary>
public class AnomalyForwarderService : BackgroundService
{
    private readonly AnomalyCloneChannel _channel;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AnomalyForwarderService> _logger;

    public AnomalyForwarderService(
        AnomalyCloneChannel channel,
        IHttpClientFactory httpClientFactory,
        ILogger<AnomalyForwarderService> logger)
    {
        _channel = channel;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AnomalyForwarderService started. Listening for payloads...");

        await foreach (var payload in _channel.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                var client = _httpClientFactory.CreateClient("AiService");
                var response = await client.PostAsJsonAsync("/anomaly/detect", new
                {
                    order_id = payload.OrderId,
                    total_amount = payload.TotalAmount,
                    quantity = payload.Quantity,
                    discount_amount = payload.DiscountAmount,
                    discount_type = payload.DiscountType,
                    hour_of_day = payload.HourOfDay,
                    day_of_week = payload.DayOfWeek,
                    is_refund = payload.IsRefund,
                    cashier_id = payload.CashierId,
                    cashier_name = payload.CashierName,
                    location_id = payload.LocationId,
                    location_name = payload.LocationName,
                }, stoppingToken);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogDebug("Anomaly check completed for order {OrderId}", payload.OrderId);
                }
                else
                {
                    _logger.LogWarning("AI service returned {Status} for order {OrderId}",
                        response.StatusCode, payload.OrderId);
                }
            }
            catch (HttpRequestException ex)
            {
                // AI service is down — log and continue (POS keeps working)
                _logger.LogWarning(ex, "Failed to reach AI service for order {OrderId}. Skipping.", payload.OrderId);
            }
            catch (TaskCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error processing anomaly payload for {OrderId}", payload.OrderId);
            }
        }
    }
}
