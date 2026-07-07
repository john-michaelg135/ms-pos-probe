export default function AlertsPage() {
  return (
    <div className="space-y-4 page-enter">
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Anomaly Alerts</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Real-time fraud detection alerts from the Isolation Forest model
        </p>
      </div>
      <div className="bg-white dark:bg-[#1a2231] border border-gray-200 dark:border-[#2d3748] rounded-2xl p-12 flex items-center justify-center card-hover animate-bounce-in stagger-1">
        <p className="text-gray-500 text-[13px]">
          Available in Sprint 3 (US-PROBE-030–031) — Live WebSocket alerts and
          historical alert table will render here.
        </p>
      </div>
    </div>
  );
}
