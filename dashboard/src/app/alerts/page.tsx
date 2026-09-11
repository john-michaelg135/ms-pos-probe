"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff, CheckCircle, XCircle, AlertTriangle, Brain, TrendingUp, Clock, MapPin, User } from "lucide-react";
import { fetchAlerts, updateAlertStatus, fetchAlertExplanation, fetchForecastLocations, AlertItem } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const RISK_BORDER: Record<string, string> = {
  Critical: "border-l-destructive",
  High: "border-l-error-500",
  Medium: "border-l-warning-500",
  Low: "border-l-success-500",
};

function riskVariant(level: string): "destructive" | "warning" | "success" | "secondary" {
  if (level === "Critical" || level === "High") return "destructive";
  if (level === "Medium") return "warning";
  if (level === "Low") return "success";
  return "secondary";
}

function statusVariant(status: string): "default" | "success" | "secondary" {
  if (status === "New") return "default";
  if (status === "Reviewed") return "success";
  return "secondary";
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<AlertItem[]>([]);
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:5020") + "/api/probe/alerts/ws";
    let reconnectTimeout: NodeJS.Timeout;
    let retryCount = 0;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { setWsConnected(true); retryCount = 0; };
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
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send("ping");
    }, 30000);

    return () => {
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, []);

  const { data: alertsData, isLoading } = useQuery({
    queryKey: ["alerts", page, riskFilter, statusFilter, locationFilter],
    queryFn: () => fetchAlerts({
      page,
      risk_level: riskFilter !== "All" ? riskFilter : undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
      location_name: locationFilter !== "All" ? locationFilter : undefined,
    }),
  });

  const { data: locations } = useQuery({
    queryKey: ["forecast", "locations"],
    queryFn: fetchForecastLocations,
  });

  const handleStatusUpdate = useCallback(async (alertId: string, newStatus: string) => {
    try {
      await updateAlertStatus(alertId, newStatus);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setLiveAlerts((prev) => prev.filter((a) => a.alert_id !== alertId));
      setSelectedAlert(null);
    } catch {}
  }, [queryClient]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Anomaly Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time fraud detection alerts</p>
      </div>

      {/* Live Alert Panel */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Live Alerts</CardTitle>
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <><Wifi className="w-3.5 h-3.5 text-success" /><span className="text-xs text-success font-medium">Connected</span></>
            ) : (
              <><WifiOff className="w-3.5 h-3.5 text-destructive" /><span className="text-xs text-destructive font-medium">Disconnected</span></>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {liveAlerts.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-6 h-6 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No live alerts yet. Suspicious transactions will appear here in real time.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {liveAlerts.map((alert) => (
                <AlertCard key={alert.alert_id} alert={alert} onReview={setSelectedAlert} onDismiss={(id) => handleStatusUpdate(id, "Dismissed")} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert History */}
      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={riskFilter} onValueChange={(v: string) => { setRiskFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Risk Levels</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Reviewed">Reviewed</SelectItem>
                <SelectItem value="Dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={(v: string) => { setLocationFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Locations</SelectItem>
                {locations?.map((loc, i) => (
                  <SelectItem key={`loc-${i}`} value={loc.location_name}>{loc.location_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="h-[200px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
            </div>
          ) : alertsData && alertsData.alerts.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertsData.alerts.map((alert) => (
                      <TableRow key={alert.alert_id} className={`border-l-4 ${RISK_BORDER[alert.risk_level] || "border-l-transparent"}`}>
                        <TableCell className="text-muted-foreground">{formatDateTime(alert.detected_at)}</TableCell>
                        <TableCell className="font-medium">{alert.order_id}</TableCell>
                        <TableCell className="text-right">₱{alert.transaction_amount.toLocaleString()}</TableCell>
                        <TableCell><Badge variant={riskVariant(alert.risk_level)}>{alert.risk_level}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">{alert.reason}</TableCell>
                        <TableCell><Badge variant={statusVariant(alert.status)}>{alert.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {alert.status === "New" && (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="secondary" onClick={() => setSelectedAlert(alert)}>Review</Button>
                              <Button size="sm" variant="ghost" onClick={() => handleStatusUpdate(alert.alert_id, "Dismissed")}>Dismiss</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {alertsData.total_pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground">Page {alertsData.page} of {alertsData.total_pages} ({alertsData.total} alerts)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Previous</Button>
                    <Button size="sm" variant="outline" onClick={() => setPage(Math.min(alertsData.total_pages, page + 1))} disabled={page === alertsData.total_pages}>Next</Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No anomaly alerts found. The system has not detected any suspicious transactions yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertReviewModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onMarkReviewed={(id) => handleStatusUpdate(id, "Reviewed")}
        onDismiss={(id) => handleStatusUpdate(id, "Dismissed")}
      />
    </div>
  );
}

function AlertReviewModal({
  alert, onClose, onMarkReviewed, onDismiss,
}: {
  alert: AlertItem | null;
  onClose: () => void;
  onMarkReviewed: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { data: explanation, isLoading: loadingExplanation } = useQuery({
    queryKey: ["alert-explanation", alert?.alert_id],
    queryFn: () => fetchAlertExplanation(alert!.alert_id),
    enabled: !!alert,
  });

  return (
    <Dialog open={!!alert} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {alert && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <DialogTitle>Alert Review</DialogTitle>
                <Badge variant={riskVariant(alert.risk_level)}>{alert.risk_level}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Order {alert.order_id}</p>
            </DialogHeader>

            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Transaction Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <DetailItem icon={<TrendingUp className="w-3.5 h-3.5" />} label="Amount" value={`₱${alert.transaction_amount.toLocaleString()}`} />
                  <DetailItem icon={<Clock className="w-3.5 h-3.5" />} label="Detected" value={formatDateTime(alert.detected_at)} />
                  <DetailItem icon={<User className="w-3.5 h-3.5" />} label="Cashier" value={alert.cashier_name || alert.cashier_id || "Unknown"} />
                  <DetailItem icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={alert.location_name || "Unknown"} />
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Why It Was Flagged</h3>
                <div className="space-y-1.5">
                  {alert.reason.split("; ").map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-warning-500 mt-0.5">•</span>
                      <span className="text-sm text-muted-foreground">{r}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Anomaly Score: {alert.anomaly_score}</p>
              </div>

              <div className="bg-muted/40 rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <h3 className="text-xs font-semibold text-foreground">AI Explanation</h3>
                  <Badge variant="purple">Isolation Forest</Badge>
                </div>

                {loadingExplanation ? (
                  <div className="h-[80px] flex items-center justify-center">
                    <p className="text-xs text-muted-foreground animate-pulse">Analyzing transaction patterns…</p>
                  </div>
                ) : explanation ? (
                  <div className="space-y-3">
                    {explanation.explanation.split("\n\n").map((para, i) => (
                      <p key={i} className="text-sm text-muted-foreground leading-relaxed">{para}</p>
                    ))}

                    {explanation.historical_context.avg_transaction_amount && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground font-medium mb-2">Historical Baseline:</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Avg Transaction: </span><span className="text-foreground font-medium">₱{explanation.historical_context.avg_transaction_amount.toLocaleString()}</span></div>
                          <div><span className="text-muted-foreground">Avg Quantity: </span><span className="text-foreground font-medium">{explanation.historical_context.avg_quantity} units</span></div>
                          <div><span className="text-muted-foreground">Total Analyzed: </span><span className="text-foreground font-medium">{explanation.historical_context.total_transactions_analyzed} txns</span></div>
                          <div><span className="text-muted-foreground">Peak Hours: </span><span className="text-foreground font-medium">{explanation.historical_context.peak_hours.map(h => `${h}:00`).join(", ") || "N/A"}</span></div>
                        </div>
                      </div>
                    )}

                    {explanation.cashier_context && (
                      <div className="mt-2 p-2 bg-warning-500/10 rounded-lg">
                        <p className="text-xs text-warning-600 dark:text-warning-400">{explanation.cashier_context}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Unable to generate explanation.</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => onDismiss(alert.alert_id)}>Dismiss Alert</Button>
              <Button onClick={() => onMarkReviewed(alert.alert_id)}>Mark as Reviewed</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
        <p className="text-sm text-foreground font-medium">{value}</p>
      </div>
    </div>
  );
}

function AlertCard({ alert, onReview, onDismiss }: { alert: AlertItem; onReview: (alert: AlertItem) => void; onDismiss: (id: string) => void }) {
  return (
    <div className={`border-l-4 rounded-xl p-4 bg-muted/40 ${RISK_BORDER[alert.risk_level] || "border-l-muted"}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">Order {alert.order_id}</span>
            <Badge variant={riskVariant(alert.risk_level)}>{alert.risk_level}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{alert.reason}</p>
          <p className="text-[10px] text-muted-foreground mt-1">₱{alert.transaction_amount.toLocaleString()} • {alert.cashier_name || alert.cashier_id || "Unknown"} • {formatDateTime(alert.detected_at)}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => onReview(alert)} title="Review"><CheckCircle className="w-3.5 h-3.5 text-success" /></Button>
          <Button size="icon" variant="ghost" onClick={() => onDismiss(alert.alert_id)} title="Dismiss"><XCircle className="w-3.5 h-3.5 text-muted-foreground" /></Button>
        </div>
      </div>
    </div>
  );
}
