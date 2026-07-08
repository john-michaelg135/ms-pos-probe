"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { fetchAlerts, updateAlertStatus, AlertItem } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";

const RISK_COLORS: Record<string, string> = {
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
        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        retryCount++;
        reconnectTimeout = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    // Keep-alive ping every 30s
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
    } catch {}
  }, [queryClient]);

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
              <AlertCard key={alert.alert_id} alert={alert} onStatusUpdate={handleStatusUpdate} />
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
                            <button onClick={() => handleStatusUpdate(alert.alert_id, "Reviewed")} className="px-2 py-1 text-[10px] rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-500 hover:bg-brand-100 btn-press">Review</button>
                            <button onClick={() => handleStatusUpdate(alert.alert_id, "Dismissed")} className="px-2 py-1 text-[10px] rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 btn-press">Dismiss</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
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
    </div>
  );
}

function AlertCard({ alert, onStatusUpdate }: { alert: AlertItem; onStatusUpdate: (id: string, status: string) => void }) {
  return (
    <div className={`border-l-4 rounded-xl p-4 animate-slide-up ${RISK_COLORS[alert.risk_level] || "border-l-gray-300 bg-gray-50 dark:bg-gray-800"}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">Order {alert.order_id}</span>
            <RiskBadge level={alert.risk_level} />
          </div>
          <p className="text-[11px] text-gray-600 dark:text-gray-400">{alert.reason}</p>
          <p className="text-[10px] text-gray-400 mt-1">₱{alert.transaction_amount.toLocaleString()} • {alert.cashier_id ? `Cashier ${alert.cashier_id}` : "Unknown"} • {formatDateTime(alert.detected_at)}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onStatusUpdate(alert.alert_id, "Reviewed")} className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700 btn-press" title="Mark as Reviewed"><CheckCircle size={14} className="text-success-500" /></button>
          <button onClick={() => onStatusUpdate(alert.alert_id, "Dismissed")} className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700 btn-press" title="Dismiss"><XCircle size={14} className="text-gray-400" /></button>
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
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
