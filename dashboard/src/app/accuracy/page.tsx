"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, Brain, TrendingUp } from "lucide-react";
import { fetchForecastBacktest, fetchAnomalyMetrics } from "@/lib/api";

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
    <div className="space-y-6 page-enter">
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Model Accuracy Report</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Mathematical proof of model accuracy for academic defense verification
        </p>
      </div>

      {/* Prophet / Forecast Section */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-1">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <TrendingUp size={18} className="text-brand-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Demand Forecasting Model</h2>
            <p className="text-[11px] text-gray-500">Facebook Prophet / Exponential Smoothing</p>
          </div>
          {backtest.data?.overall && (
            <PassFailBadge passed={backtest.data.overall.overall_pass} className="ml-auto" />
          )}
        </div>

        {backtest.isLoading ? (
          <div className="h-[100px] shimmer rounded-xl flex items-center justify-center"><p className="text-[12px] text-gray-500">Loading backtest results...</p></div>
        ) : backtest.data?.status === "no_model" ? (
          <p className="text-[12px] text-gray-500">No trained forecast model found. Run train_prophet.py first.</p>
        ) : backtest.data?.overall ? (
          <div>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard label="MAPE (Avg)" value={`${backtest.data.overall.avg_mape}%`} sublabel={`Target: ≤ ${backtest.data.overall.pass_threshold}%`} pass={backtest.data.overall.overall_pass} />
              <MetricCard label="MAE (Avg)" value={`${backtest.data.overall.avg_mae}`} sublabel="Mean Absolute Error" />
              <MetricCard label="R²" value={`${backtest.data.overall.avg_r_squared}`} sublabel="Coefficient of Determination" />
              <MetricCard label="Variations Passed" value={`${backtest.data.overall.passed}/${backtest.data.overall.total}`} sublabel="MAPE ≤ 20%" />
            </div>

            {/* Per-variation table */}
            <details className="group">
              <summary className="text-[12px] text-brand-500 cursor-pointer hover:underline font-medium">View per-variation breakdown</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-2 text-gray-500">Variation</th>
                      <th className="text-right py-2 px-2 text-gray-500">MAPE</th>
                      <th className="text-right py-2 px-2 text-gray-500">MAE</th>
                      <th className="text-right py-2 px-2 text-gray-500">R²</th>
                      <th className="text-center py-2 px-2 text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.data.metrics.map((m, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-2 text-gray-900 dark:text-gray-100">{m.variation_name}</td>
                        <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{m.mape}%</td>
                        <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{m.mae}</td>
                        <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{m.r_squared}</td>
                        <td className="py-2 px-2 text-center">{m.mape <= 20 ? <CheckCircle size={13} className="inline text-success-500" /> : <XCircle size={13} className="inline text-error-500" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ) : null}
      </div>

      {/* Isolation Forest Section */}
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-6 card-hover animate-bounce-in stagger-2">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Brain size={18} className="text-purple-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Anomaly Detection Model</h2>
            <p className="text-[11px] text-gray-500">Scikit-Learn Isolation Forest</p>
          </div>
          {anomalyMetrics.data && (
            <PassFailBadge passed={anomalyMetrics.data.overall_pass} className="ml-auto" />
          )}
        </div>

        {anomalyMetrics.isLoading ? (
          <div className="h-[100px] shimmer rounded-xl flex items-center justify-center"><p className="text-[12px] text-gray-500">Loading metrics...</p></div>
        ) : anomalyMetrics.data?.status === "no_model" ? (
          <p className="text-[12px] text-gray-500">No trained Isolation Forest model found. Run train_iforest.py first.</p>
        ) : anomalyMetrics.data?.metrics ? (
          <div>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard label="Precision" value={`${(anomalyMetrics.data.metrics.precision * 100).toFixed(1)}%`} sublabel="True positive rate" />
              <MetricCard label="Recall" value={`${(anomalyMetrics.data.metrics.recall * 100).toFixed(1)}%`} sublabel="Detection rate" />
              <MetricCard label="F1-Score" value={`${(anomalyMetrics.data.metrics.f1_score * 100).toFixed(1)}%`} sublabel={`Target: ≥ ${(anomalyMetrics.data.pass_threshold * 100)}%`} pass={anomalyMetrics.data.overall_pass} />
              <MetricCard label="Contamination" value={`${(anomalyMetrics.data.contamination * 100).toFixed(0)}%`} sublabel="Expected anomaly rate" />
            </div>

            {/* Confusion Matrix */}
            <h3 className="text-[12px] font-semibold text-gray-900 dark:text-gray-50 mb-3">Confusion Matrix</h3>
            <div className="grid grid-cols-2 gap-2 max-w-[320px]">
              <div className="bg-success-50 dark:bg-success-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">True Negative</p>
                <p className="text-lg font-bold text-success-600 dark:text-success-400">{anomalyMetrics.data.metrics.confusion_matrix.true_negative.toLocaleString()}</p>
              </div>
              <div className="bg-error-50 dark:bg-error-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">False Positive</p>
                <p className="text-lg font-bold text-error-600 dark:text-error-400">{anomalyMetrics.data.metrics.confusion_matrix.false_positive.toLocaleString()}</p>
              </div>
              <div className="bg-warning-50 dark:bg-warning-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">False Negative</p>
                <p className="text-lg font-bold text-warning-600 dark:text-warning-400">{anomalyMetrics.data.metrics.confusion_matrix.false_negative.toLocaleString()}</p>
              </div>
              <div className="bg-success-50 dark:bg-success-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">True Positive</p>
                <p className="text-lg font-bold text-success-600 dark:text-success-400">{anomalyMetrics.data.metrics.confusion_matrix.true_positive.toLocaleString()}</p>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 mt-3">
              Trained at: {anomalyMetrics.data.trained_at} • Contamination: {anomalyMetrics.data.contamination}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sublabel, pass }: { label: string; value: string; sublabel: string; pass?: boolean }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-lg font-bold text-gray-900 dark:text-gray-50">{value}</p>
        {pass !== undefined && (pass ? <CheckCircle size={14} className="text-success-500" /> : <XCircle size={14} className="text-error-500" />)}
      </div>
      <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p>
    </div>
  );
}

function PassFailBadge({ passed, className = "" }: { passed: boolean; className?: string }) {
  return (
    <span className={`px-3 py-1.5 rounded-xl text-[11px] font-bold ${
      passed
        ? "bg-success-100 dark:bg-success-500/20 text-success-600 dark:text-success-400"
        : "bg-error-100 dark:bg-error-500/20 text-error-600 dark:text-error-400"
    } ${className}`}>
      {passed ? "✅ PASSED" : "⚠️ NEEDS TUNING"}
    </span>
  );
}
