export default function ForecastPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Demand Forecast</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Predicted daily demand for each Ube product variation
        </p>
      </div>
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-12 flex items-center justify-center">
        <p className="text-gray-500 text-[13px]">
          Available in Sprint 2 (US-PROBE-020) — Prophet model predictions will
          render here as line charts.
        </p>
      </div>
    </div>
  );
}
