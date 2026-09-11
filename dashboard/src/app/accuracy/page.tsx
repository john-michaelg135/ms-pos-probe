"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, Brain, TrendingUp, Info } from "lucide-react";
import { fetchForecastBacktest, fetchAnomalyMetrics } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AccuracyPage() {
  const backtest = useQuery({
    queryKey: ["forecast", "backtest"],
    queryFn: fetchForecastBacktest,
  });

  const anomalyMetrics = useQuery({
    queryKey: ["anomaly", "metrics"],
    queryFn: fetchAnomalyMetrics,
  });

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Model Accuracy Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mathematical proof of model accuracy for academic defense verification
          </p>
        </div>

        {/* Forecast Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-brand-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Demand Forecasting Model</h2>
                <p className="text-xs text-muted-foreground">Facebook Prophet / Exponential Smoothing</p>
              </div>
              {backtest.data?.overall && (
                <PassFailBadge passed={backtest.data.overall.overall_pass} className="ml-auto" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {backtest.isLoading ? (
              <div className="h-[100px] flex items-center justify-center"><p className="text-sm text-muted-foreground animate-pulse">Loading backtest results…</p></div>
            ) : backtest.data?.status === "no_model" ? (
              <p className="text-sm text-muted-foreground">No trained forecast model found. Run train_prophet.py first.</p>
            ) : backtest.data?.overall ? (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <MetricCard label="MAPE (Avg)" value={`${backtest.data.overall.avg_mape}%`} sublabel={`Target: ≤ ${backtest.data.overall.pass_threshold}%`} pass={backtest.data.overall.overall_pass} tooltip="Mean Absolute Percentage Error (MAPE) measures the average percentage difference between predicted and actual values. Lower values indicate better accuracy. A MAPE ≤ 20% is generally considered acceptable for demand forecasting." />
                  <MetricCard label="MAE (Avg)" value={`${backtest.data.overall.avg_mae}`} sublabel="Mean Absolute Error" tooltip="Mean Absolute Error (MAE) measures the average magnitude of errors in predictions without considering their direction. Lower MAE means more accurate predictions." />
                  <MetricCard label="R²" value={`${backtest.data.overall.avg_r_squared}`} sublabel="Coefficient of Determination" tooltip="R² indicates how well the model's predictions fit the actual data. Values range from 0 to 1, where 1 means perfect prediction. Values above 0.7 are generally considered good." />
                  <MetricCard label="Variations Passed" value={`${backtest.data.overall.passed}/${backtest.data.overall.total}`} sublabel="MAPE ≤ 20%" tooltip="Variations Passed shows how many product variations achieved a MAPE within the acceptable threshold (≤ 20%)." />
                </div>

                <details className="group">
                  <summary className="text-sm text-brand-500 cursor-pointer hover:underline font-medium">View per-variation breakdown</summary>
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Variation</TableHead>
                          <TableHead className="text-right">MAPE</TableHead>
                          <TableHead className="text-right">MAE</TableHead>
                          <TableHead className="text-right">R²</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backtest.data.metrics.map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-foreground">{m.variation_name}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{m.mape}%</TableCell>
                            <TableCell className="text-right text-muted-foreground">{m.mae}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{m.r_squared}</TableCell>
                            <TableCell className="text-center">
                              {m.mape <= 20
                                ? <CheckCircle className="w-3.5 h-3.5 inline text-success" />
                                : <XCircle className="w-3.5 h-3.5 inline text-destructive" />}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Isolation Forest Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <Brain className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Anomaly Detection Model</h2>
                <p className="text-xs text-muted-foreground">Scikit-Learn Isolation Forest</p>
              </div>
              {anomalyMetrics.data && (
                <PassFailBadge passed={anomalyMetrics.data.overall_pass} className="ml-auto" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {anomalyMetrics.isLoading ? (
              <div className="h-[100px] flex items-center justify-center"><p className="text-sm text-muted-foreground animate-pulse">Loading metrics…</p></div>
            ) : anomalyMetrics.data?.status === "no_model" ? (
              <p className="text-sm text-muted-foreground">No trained Isolation Forest model found. Run train_iforest.py first.</p>
            ) : anomalyMetrics.data?.metrics ? (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <MetricCard label="Precision" value={`${(anomalyMetrics.data.metrics.precision * 100).toFixed(1)}%`} sublabel="True positive rate" tooltip="Precision measures the proportion of detected anomalies that are actual anomalies. A high precision means fewer false alarms." />
                  <MetricCard label="Recall" value={`${(anomalyMetrics.data.metrics.recall * 100).toFixed(1)}%`} sublabel="Detection rate" tooltip="Recall measures the proportion of actual anomalies that were correctly detected. A high recall means fewer missed anomalies." />
                  <MetricCard label="F1-Score" value={`${(anomalyMetrics.data.metrics.f1_score * 100).toFixed(1)}%`} sublabel={`Target: ≥ ${(anomalyMetrics.data.pass_threshold * 100)}%`} pass={anomalyMetrics.data.overall_pass} tooltip="F1-Score is the harmonic mean of Precision and Recall, providing a single balanced metric. A score ≥ 85% indicates the model effectively balances detection with false alarm minimization." />
                  <MetricCard label="Contamination" value={`${(anomalyMetrics.data.contamination * 100).toFixed(0)}%`} sublabel="Expected anomaly rate" tooltip="Contamination defines the expected proportion of anomalies in the dataset. It guides how aggressively the model flags outliers." />
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xs font-semibold text-foreground">Confusion Matrix</h3>
                  <InfoTooltip text="A Confusion Matrix visualizes classification performance: True Negatives (correctly identified normal), False Positives (normal flagged as anomaly), False Negatives (missed anomalies), True Positives (correctly detected anomalies). Ideally TN and TP are high while FP and FN are low." />
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-[320px]">
                  <ConfusionCell label="True Negative" value={anomalyMetrics.data.metrics.confusion_matrix.true_negative} tone="success" />
                  <ConfusionCell label="False Positive" value={anomalyMetrics.data.metrics.confusion_matrix.false_positive} tone="destructive" />
                  <ConfusionCell label="False Negative" value={anomalyMetrics.data.metrics.confusion_matrix.false_negative} tone="warning" />
                  <ConfusionCell label="True Positive" value={anomalyMetrics.data.metrics.confusion_matrix.true_positive} tone="success" />
                </div>

                <p className="text-[10px] text-muted-foreground mt-3">
                  Trained at: {anomalyMetrics.data.trained_at} • Contamination: {anomalyMetrics.data.contamination}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({ label, value, sublabel, pass, tooltip }: { label: string; value: string; sublabel: string; pass?: boolean; tooltip?: string }) {
  return (
    <div className="bg-muted/50 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="flex items-center gap-2">
        <p className="text-lg font-bold text-foreground">{value}</p>
        {pass !== undefined && (pass ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />)}
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
    </div>
  );
}

function ConfusionCell({ label, value, tone }: { label: string; value: number; tone: "success" | "destructive" | "warning" }) {
  const bg = tone === "success" ? "bg-success/10" : tone === "destructive" ? "bg-destructive/10" : "bg-warning/10";
  const fg = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-warning";
  return (
    <div className={`rounded-xl p-3 text-center ${bg}`}>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${fg}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-brand-500 transition-colors cursor-help" aria-label="More info">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

function PassFailBadge({ passed, className = "" }: { passed: boolean; className?: string }) {
  return (
    <Badge variant={passed ? "success" : "warning"} className={className}>
      {passed ? "✅ PASSED" : "⚠️ NEEDS TUNING"}
    </Badge>
  );
}
