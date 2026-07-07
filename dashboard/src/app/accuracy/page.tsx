export default function AccuracyPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Model Accuracy Report</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Prophet backtesting results and Isolation Forest confusion matrix for
          academic defense verification
        </p>
      </div>
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-12 flex items-center justify-center">
        <p className="text-gray-500 text-[13px]">
          Available in Sprint 3 (US-PROBE-034) — MAPE, MAE, R², F1-Score, and
          Confusion Matrix will display here with pass/fail indicators.
        </p>
      </div>
    </div>
  );
}
