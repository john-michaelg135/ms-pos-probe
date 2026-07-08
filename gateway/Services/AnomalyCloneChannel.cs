using System.Threading.Channels;

namespace PosProbe.Gateway.Services;

/// <summary>
/// US-PROBE-018: Bounded Channel for fire-and-forget anomaly detection.
/// Acts as a backpressure circuit breaker — if the AI service dies,
/// old payloads are dropped rather than crashing the gateway with OOM.
/// </summary>
public class AnomalyCloneChannel
{
    private readonly Channel<TransactionPayload> _channel;

    public AnomalyCloneChannel()
    {
        // Bounded capacity: max 10,000 items. Drop oldest on overflow.
        _channel = Channel.CreateBounded<TransactionPayload>(new BoundedChannelOptions(10_000)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });
    }

    public ChannelWriter<TransactionPayload> Writer => _channel.Writer;
    public ChannelReader<TransactionPayload> Reader => _channel.Reader;
}

/// <summary>
/// Represents a cloned transaction payload to send to the AI service.
/// </summary>
public record TransactionPayload(
    string OrderId,
    decimal TotalAmount,
    int Quantity,
    decimal DiscountAmount,
    string? DiscountType,
    int HourOfDay,
    int DayOfWeek,
    bool IsRefund,
    string? CashierId,
    string? CashierName,
    int? LocationId,
    string? LocationName
);
