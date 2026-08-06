"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff, CheckCircle, XCircle, AlertTriangle, X, Brain, TrendingUp, Clock, MapPin, User } from "lucide-react";
import { fetchAlerts, updateAlertStatus, fetchAlertExplanation, AlertItem, AlertExplanation } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";

const RISK_COLORS: Record<string, string> = {
  Critical: "border-l-red-600 bg-red-50 dark:bg-red-500/10",
  High: "border-l-error-500 bg-error-50 dark:bg-error-500/10",
  Medium: "border-l-warning-500 bg-warning-50 dark:bg-warning-500/10",
  Low: "border-l-success-500 bg-gray-50 dark:bg-gray-800",
};

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<AlertItem[]>([]);
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket connection for live alerts
  useEffect(() => {
    const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:5020") + "/api/probe/alerts/ws";
    let reconnectTimeout: NodeJS.Timeout;
    let retryCount = 0;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        retryCount = 0;
      };

      ws.onmessage = (event) => {
        try {
          const alert = JSON.parse(event.data) as AlertItem;
          setLiveAlerts((prev) => [alert, ...prev].slice(0, 50));
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        retryCount++;
        reconnectTimeout = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 30000);

    return () => {
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, []);

  // Alert history query
  const { data: alertsData, isLoading } = useQuery({
    queryKey: ["alerts", page, riskFilter, statusFilter],
    queryFn: () => fetchAlerts({
      page,
      risk_level: riskFilter !== "All" ? riskFilter : undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
    }),
  });

  const handleStatusUpdate = useCallback(async (alertId: string, newStatus: string) => {
    try {
      await updateAlertStatus(alertId, newStatus);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setLiveAlerts((prev) => prev.filter((a) => a.alert_id !== alertId));
      setSelectedAlert(null);
    } catch {}
  }, [queryClient]);

  const handleReviewClick = (alert: AlertItem) => {
    setSelectedAlert(alert);
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Anomaly Alerts</h1>
        <p className="text-[13px] text-gray-500 mt-1">Real-time fraud detection alerts</p>
      </div>

      {/* Live Alert Panel */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50">Live Alerts</h2>
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <><Wifi size={14} className="text-success-500" /><span className="text-[11px] text-success-500 font-medium">Connected</span></>
            ) : (
              <><WifiOff size={14} className="text-error-500" /><span className="text-[11px] text-error-500 font-medium">Disconnected</span></>
            )}
          </div>
        </div>

        {liveAlerts.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-[12px] text-gray-500">No live alerts yet. Suspicious transactions will appear here in real time.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {liveAlerts.map((alert) => (
              <AlertCard key={alert.alert_id} alert={alert} onReview={handleReviewClick} onDismiss={(id) => handleStatusUpdate(id, "Dismissed")} />
            ))}
          </div>
        )}
      </div>

      {/* Alert History */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-2">
        <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 mb-4">Alert History</h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="All">All Risk Levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="All">All Statuses</option>
            <option value="New">New</option>
            <option value="Reviewed">Reviewed</option>
            <option value="Dismissed">Dismissed</option>
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center shimmer rounded-xl"><p className="text-[12px] text-gray-500">Loading...</p></div>
        ) : alertsData && alertsData.alerts.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Date/Time</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Order</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Amount</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Risk</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Reason</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Status</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alertsData.alerts.map((alert) => (
                    <tr key={alert.alert_id} className={`border-b border-gray-100 dark:border-gray-800 border-l-4 ${RISK_COLORS[alert.risk_level] || ""}`}>
                      <td className="py-2.5 px-2 text-gray-700 dark:text-gray-300">{formatDateTime(alert.detected_at)}</td>
                      <td className="py-2.5 px-2 text-gray-900 dark:text-gray-100 font-medium">{alert.order_id}</td>
                      <td className="py-2.5 px-2 text-right text-gray-900 dark:text-gray-100">₱{alert.transaction_amount.toLocaleString()}</td>
                      <td className="py-2.5 px-2"><RiskBadge level={alert.risk_level} /></td>
                      <td className="py-2.5 px-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{alert.reason}</td>
                      <td className="py-2.5 px-2"><StatusBadge status={alert.status} /></td>
                      <td className="py-2.5 px-2 text-right">
                        {alert.status === "New" && (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleReviewClick(alert)} className="px-2 py-1 text-[10px] rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-500 hover:bg-brand-100 btn-press">Review</button>
                            <button onClick={() => handleStatusUpdate(alert.alert_id, "Dismissed")} className="px-2 py-1 text-[10px] rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 btn-press">Dismiss</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {alertsData.total_pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-[11px] text-gray-500">Page {alertsData.page} of {alertsData.total_pages} ({alertsData.total} alerts)</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 btn-press">Previous</button>
                  <button onClick={() => setPage(Math.min(alertsData.total_pages, page + 1))} disabled={page === alertsData.total_pages} className="px-3 py-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 btn-press">Next</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-[12px] text-gray-500">No anomaly alerts found. The system has not detected any suspicious transactions yet.</p>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedAlert && (
        <AlertReviewModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onMarkReviewed={() => handleStatusUpdate(selectedAlert.alert_id, "Reviewed")}
          onDismiss={() => handleStatusUpdate(selectedAlert.alert_id, "Dismissed")}
        />
      )}
    </div>
  );
}

// ── Review Modal ──
function AlertReviewModal({
  alert,
  onClose,
  onMarkReviewed,
  onDismiss,
}: {
  alert: AlertItem;
  onClose: () => void;
  onMarkReviewed: () => void;
  onDismiss: () => void;
}) {
  const { data: explanation, isLoading: loadingExplanation } = useQuery({
    queryKey: ["alert-explanation", alert.alert_id],
    queryFn: () => fetchAlertExplanation(alert.alert_id),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-[#1a2231] rounded-2xl border border-gray-200 dark:border-[#2d3748] shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#1a2231] border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              alert.risk_level === "Critical" ? "bg-red-500" :
              alert.risk_level === "High" ? "bg-orange-500" :
              alert.risk_level === "Medium" ? "bg-yellow-500" : "bg-gray-400"
            }`} />
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Alert Review</h2>
              <p className="text-[11px] text-gray-500">Order {alert.order_id}</p>
            </div>
            <RiskBadge level={alert.risk_level} />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 btn-press" aria-label="Close">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Transaction Details */}
          <div>
            <h3 className="text-[12px] font-semibold text-gray-900 dark:text-gray-50 uppercase tracking-wide mb-3">Transaction Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <DetailItem icon={<TrendingUp size={14} />} label="Amount" value={`₱${alert.transaction_amount.toLocaleString()}`} />
              <DetailItem icon={<Clock size={14} />} label="Detected" value={formatDateTime(alert.detected_at)} />
              <DetailItem icon={<User size={14} />} label="Cashier" value={alert.cashier_name || alert.cashier_id || "Unknown"} />
              <DetailItem icon={<MapPin size={14} />} label="Location" value={alert.location_name || "Unknown"} />
            </div>
          </div>

          {/* Reason (full) */}
          <div>
            <h3 className="text-[12px] font-semibold text-gray-900 dark:text-gray-50 uppercase tracking-wide mb-2">Why It Was Flagged</h3>
            <div className="space-y-1.5">
              {alert.reason.split("; ").map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-warning-500 mt-0.5">•</span>
                  <span className="text-[12px] text-gray-700 dark:text-gray-300">{r}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Anomaly Score: {alert.anomaly_score}</p>
          </div>

          {/* AI Explanation */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={16} className="text-purple-500" />
              <h3 className="text-[12px] font-semibold text-gray-900 dark:text-gray-50">AI Explanation</h3>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">Isolation Forest</span>
            </div>

            {loadingExplanation ? (
              <div className="h-[80px] shimmer rounded-lg flex items-center justify-center">
                <p className="text-[11px] text-gray-500">Analyzing transaction patterns...</p>
              </div>
            ) : explanation ? (
              <div className="space-y-3">
                {explanation.explanation.split("\n\n").map((para, i) => (
                  <p key={i} className="text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed">{para}</p>
                ))}

                {/* Historical context */}
                {explanation.historical_context.avg_transaction_amount && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 font-medium mb-2">Historical Baseline:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-[11px]">
                        <span className="text-gray-400">Avg Transaction: </span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">₱{explanation.historical_context.avg_transaction_amount.toLocaleString()}</span>
                      </div>
                      <div className="text-[11px]">
                        <span className="text-gray-400">Avg Quantity: </span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{explanation.historical_context.avg_quantity} units</span>
                      </div>
                      <div className="text-[11px]">
                        <span className="text-gray-400">Total Analyzed: </span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{explanation.historical_context.total_transactions_analyzed} txns</span>
                      </div>
                      <div className="text-[11px]">
                        <span className="text-gray-400">Peak Hours: </span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{explanation.historical_context.peak_hours.map(h => `${h}:00`).join(", ") || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cashier context */}
                {explanation.cashier_context && (
                  <div className="mt-2 p-2 bg-warning-50 dark:bg-warning-500/10 rounded-lg">
                    <p className="text-[11px] text-warning-700 dark:text-warning-400">{explanation.cashier_context}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-gray-500">Unable to generate explanation.</p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white dark:bg-[#1a2231] border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onDismiss}
            className="px-4 py-2.5 rounded-xl text-[12px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 btn-press"
          >
            Dismiss Alert
          </button>
          <button
            onClick={onMarkReviewed}
            className="px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_2px_8px_rgba(70,95,255,0.25)] btn-press"
          >
            Mark as Reviewed
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper Components ──

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
      <div className="text-gray-400">{icon}</div>
      <div>
        <p className="text-[10px] text-gray-400 uppercase">{label}</p>
        <p className="text-[12px] text-gray-900 dark:text-gray-100 font-medium">{value}</p>
      </div>
    </div>
  );
}

function AlertCard({ alert, onReview, onDismiss }: { alert: AlertItem; onReview: (alert: AlertItem) => void; onDismiss: (id: string) => void }) {
  return (
    <div className={`border-l-4 rounded-xl p-4 animate-slide-up ${RISK_COLORS[alert.risk_level] || "border-l-gray-300 bg-gray-50 dark:bg-gray-800"}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">Order {alert.order_id}</span>
            <RiskBadge level={alert.risk_level} />
          </div>
          <p className="text-[11px] text-gray-600 dark:text-gray-400">{alert.reason}</p>
          <p className="text-[10px] text-gray-400 mt-1">₱{alert.transaction_amount.toLocaleString()} • {alert.cashier_name || alert.cashier_id || "Unknown"} • {formatDateTime(alert.detected_at)}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onReview(alert)} className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700 btn-press" title="Review"><CheckCircle size={14} className="text-success-500" /></button>
          <button onClick={() => onDismiss(alert.alert_id)} className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700 btn-press" title="Dismiss"><XCircle size={14} className="text-gray-400" /></button>
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    Critical: "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400",
    High: "bg-error-100 dark:bg-error-500/20 text-error-600 dark:text-error-400",
    Medium: "bg-warning-100 dark:bg-warning-500/20 text-warning-600 dark:text-warning-400",
    Low: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${colors[level] || colors.Low}`}>{level}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    New: "bg-brand-50 dark:bg-brand-500/10 text-brand-500",
    Reviewed: "bg-success-50 dark:bg-success-500/10 text-success-600",
    Dismissed: "bg-gray-100 dark:bg-gray-700 text-gray-500",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[status] || ""}`}>{status}</span>;
}
