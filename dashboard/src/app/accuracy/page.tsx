"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, Brain, TrendingUp, Info } from "lucide-react";
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
              <MetricCard label="MAPE (Avg)" value={`${backtest.data.overall.avg_mape}%`} sublabel={`Target: ≤ ${backtest.data.overall.pass_threshold}%`} pass={backtest.data.overall.overall_pass} tooltip="Mean Absolute Percentage Error (MAPE) measures the average percentage difference between predicted and actual values. Lower values indicate better accuracy. A MAPE ≤ 20% is generally considered acceptable for demand forecasting." />
              <MetricCard label="MAE (Avg)" value={`${backtest.data.overall.avg_mae}`} sublabel="Mean Absolute Error" tooltip="Mean Absolute Error (MAE) measures the average magnitude of errors in predictions without considering their direction. It represents the average absolute difference between predicted and actual values. Lower MAE means more accurate predictions." />
              <MetricCard label="R²" value={`${backtest.data.overall.avg_r_squared}`} sublabel="Coefficient of Determination" tooltip="R² (R-Squared) indicates how well the model's predictions fit the actual data. Values range from 0 to 1, where 1 means perfect prediction. Values above 0.7 are generally considered good. Negative values indicate the model performs worse than a simple mean." />
              <MetricCard label="Variations Passed" value={`${backtest.data.overall.passed}/${backtest.data.overall.total}`} sublabel="MAPE ≤ 20%" tooltip="Variations Passed shows how many product variations achieved a MAPE within the acceptable threshold (≤ 20%). A higher ratio indicates the model generalizes well across different product variations." />
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
              <MetricCard label="Precision" value={`${(anomalyMetrics.data.metrics.precision * 100).toFixed(1)}%`} sublabel="True positive rate" tooltip="Precision measures the proportion of detected anomalies that are actual anomalies. A high precision means fewer false alarms. Interpreted as: of all transactions flagged as anomalous, what percentage truly are anomalies." />
              <MetricCard label="Recall" value={`${(anomalyMetrics.data.metrics.recall * 100).toFixed(1)}%`} sublabel="Detection rate" tooltip="Recall (Sensitivity) measures the proportion of actual anomalies that were correctly detected. A high recall means fewer missed anomalies. Interpreted as: of all real anomalies, what percentage did the model catch." />
              <MetricCard label="F1-Score" value={`${(anomalyMetrics.data.metrics.f1_score * 100).toFixed(1)}%`} sublabel={`Target: ≥ ${(anomalyMetrics.data.pass_threshold * 100)}%`} pass={anomalyMetrics.data.overall_pass} tooltip="F1-Score is the harmonic mean of Precision and Recall, providing a single balanced metric. Values range from 0% to 100%. A score ≥ 85% indicates the model effectively balances anomaly detection with false alarm minimization." />
              <MetricCard label="Contamination" value={`${(anomalyMetrics.data.contamination * 100).toFixed(0)}%`} sublabel="Expected anomaly rate" tooltip="Contamination is a hyperparameter that defines the expected proportion of anomalies in the dataset. It guides the Isolation Forest model on how aggressively to flag outliers. A typical value of 5% means we expect ~5% of transactions to be anomalous." />
            </div>

            {/* Confusion Matrix */}
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[12px] font-semibold text-gray-900 dark:text-gray-50">Confusion Matrix</h3>
              <InfoTooltip text="A Confusion Matrix is a table that visualizes the performance of a classification model. It shows four outcomes: True Negatives (correctly identified normal transactions), False Positives (normal transactions incorrectly flagged as anomalies), False Negatives (anomalies missed by the model), and True Positives (anomalies correctly detected). Ideally, TN and TP should be high while FP and FN should be low." position="top-left" />
            </div>
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

function MetricCard({ label, value, sublabel, pass, tooltip }: { label: string; value: string; sublabel: string; pass?: boolean; tooltip?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 relative">
      <div className="flex items-start justify-between">
        <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="flex items-center gap-2">
        <p className="text-lg font-bold text-gray-900 dark:text-gray-50">{value}</p>
        {pass !== undefined && (pass ? <CheckCircle size={14} className="text-success-500" /> : <XCircle size={14} className="text-error-500" />)}
      </div>
      <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p>
    </div>
  );
}

function InfoTooltip({ text, position = "top-right" }: { text: string; position?: "top-right" | "top-left" }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="text-gray-400 hover:text-brand-500 transition-colors cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="More info"
      >
        <Info size={13} />
      </button>
      {show && (
        <div className={`absolute z-50 bottom-full mb-2 w-64 p-3 bg-gray-900 dark:bg-gray-800 text-white text-[11px] leading-relaxed rounded-lg shadow-lg pointer-events-none ${
          position === "top-left" ? "left-0" : "right-0"
        }`}>
          {text}
          <div className={`absolute top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900 dark:border-t-gray-800 ${
            position === "top-left" ? "left-2" : "right-2"
          }`}></div>
        </div>
      )}
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
