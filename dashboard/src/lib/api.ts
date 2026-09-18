/**
 * US-PROBE-012: Centralized API client module.
 * All HTTP requests to the FastAPI backend go through this single file
 * with consistent base URL configuration, TypeScript types, and error handling.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// ── Axios Instance ──
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5020",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request Interceptor: Inject JWT Bearer token ──
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // In a real app, retrieve from cookie or auth state
    // For now, the token will be passed from the auth context
    const token =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: Normalize errors ──
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retryCount?: number;
    };

    // Exponential backoff retry for transient failures (5xx, network errors)
    const maxRetries = 2;
    const retryCount = originalRequest._retryCount ?? 0;

    if (
      retryCount < maxRetries &&
      (!error.response || error.response.status >= 500)
    ) {
      originalRequest._retryCount = retryCount + 1;
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(originalRequest);
    }

    // Normalize error object
    const normalizedError: ApiError = {
      message:
        (error.response?.data as { detail?: string })?.detail ||
        (error.response?.data as { message?: string })?.message ||
        error.message ||
        "An unexpected error occurred",
      status: error.response?.status || 0,
      code: error.code || "UNKNOWN",
    };

    return Promise.reject(normalizedError);
  }
);

// ── Types ──
export interface ApiError {
  message: string;
  status: number;
  code: string;
}

export interface HealthResponse {
  service: string;
  status: string;
  timestamp: string;
  dependencies?: {
    duckdb: string;
    redis: string;
  };
}

export interface SyncStatusResponse {
  last_sync_timestamp: string | null;
  sync_interval_minutes: number;
}

export interface SyncForceResponse {
  total_rows_synced: number;
  batch_count: number;
  sync_duration_seconds: number;
  last_sync_timestamp: string;
  error?: string;
}

// ── API Functions ──

export async function fetchGatewayHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/health");
  return data;
}

export async function fetchAiServiceHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/api/probe/health");
  return data;
}

export async function fetchSyncStatus(): Promise<SyncStatusResponse> {
  const { data } = await api.get<SyncStatusResponse>("/api/probe/sync/status");
  return data;
}

export async function triggerForceSync(): Promise<SyncForceResponse> {
  const { data } = await api.post<SyncForceResponse>("/api/probe/sync/force");
  return data;
}

// ── Sprint 2: Forecast Types & Functions ──

export interface ForecastItem {
  date: string;
  variation_id: number;
  product_name: string;
  variation_name: string;
  predicted_quantity: number;
  lower_bound: number;
  upper_bound: number;
}

export async function fetchForecast(
  days: number = 7,
  variationId?: number,
  locationName?: string
): Promise<ForecastItem[]> {
  const params: Record<string, string | number> = { days };
  if (variationId) params.variation_id = variationId;
  if (locationName) params.location_name = locationName;
  const { data } = await api.get<ForecastItem[]>("/api/probe/forecast", { params });
  return data;
}

// ── Forecast Locations ──

export interface ForecastLocation {
  location_name: string;
  transaction_count: number;
}

export async function fetchForecastLocations(): Promise<ForecastLocation[]> {
  const { data } = await api.get<ForecastLocation[]>("/api/probe/forecast/locations");
  return data;
}

// ── Forecast Insights (AI Explanation Cards) ──

export interface ForecastInsightsResponse {
  engine: string;
  variation_name: string;
  model_baseline: string;
  demand_drivers: string;
  stockout_risk: string;
  safety_stock: string;
  velocity_class: string;
}

export async function fetchForecastInsights(
  days: number = 7,
  variationId?: number
): Promise<ForecastInsightsResponse> {
  const params: Record<string, string | number> = { days };
  if (variationId) params.variation_id = variationId;
  const { data } = await api.get<ForecastInsightsResponse>("/api/probe/forecast/insights", { params });
  return data;
}

// ── Sprint 2: Analytics Types & Functions ──

export interface RevenueItem {
  period: string;
  total_revenue: number;
  total_orders: number;
  total_quantity: number;
}

export interface LocationSalesItem {
  location_name: string;
  total_revenue: number;
  total_quantity: number;
}

export interface ProductSalesItem {
  product_name: string;
  variation_name: string;
  total_revenue: number;
  total_quantity: number;
}

export interface ChannelSalesItem {
  order_source: string;
  total_revenue: number;
  total_quantity: number;
}

export async function fetchRevenue(
  groupBy: "day" | "week" | "month" = "day",
  dateFrom?: string,
  dateTo?: string
): Promise<RevenueItem[]> {
  const params: Record<string, string> = { group_by: groupBy };
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  const { data } = await api.get<RevenueItem[]>("/api/probe/analytics/revenue", { params });
  return data;
}

export async function fetchSalesByLocation(
  dateFrom?: string,
  dateTo?: string
): Promise<LocationSalesItem[]> {
  const params: Record<string, string> = {};
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  const { data } = await api.get<LocationSalesItem[]>("/api/probe/analytics/sales-by-location", { params });
  return data;
}

export async function fetchSalesByProduct(
  dateFrom?: string,
  dateTo?: string
): Promise<ProductSalesItem[]> {
  const params: Record<string, string> = {};
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  const { data } = await api.get<ProductSalesItem[]>("/api/probe/analytics/sales-by-product", { params });
  return data;
}

export async function fetchSalesByChannel(
  dateFrom?: string,
  dateTo?: string
): Promise<ChannelSalesItem[]> {
  const params: Record<string, string> = {};
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  const { data } = await api.get<ChannelSalesItem[]>("/api/probe/analytics/sales-by-channel", { params });
  return data;
}

// ── Sprint 3: Alerts & Metrics ──

export interface AlertItem {
  alert_id: string;
  order_id: string;
  transaction_amount: number;
  anomaly_score: number;
  risk_level: string;
  reason: string;
  cashier_id: string | null;
  cashier_name: string | null;
  location_id: number | null;
  location_name: string | null;
  detected_at: string;
  status: string;
}

export interface AlertsResponse {
  alerts: AlertItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface BacktestResponse {
  status: string;
  engine: string;
  metrics: Array<{
    variation_name: string;
    mape: number;
    mae: number;
    r_squared: number;
    engine: string;
  }>;
  overall: {
    avg_mape: number;
    avg_mae: number;
    avg_r_squared: number;
    passed: number;
    total: number;
    pass_threshold: number;
    overall_pass: boolean;
  };
}

export interface AnomalyMetricsResponse {
  status: string;
  trained_at: string;
  contamination: number;
  metrics: {
    precision: number;
    recall: number;
    f1_score: number;
    confusion_matrix: {
      true_negative: number;
      false_positive: number;
      false_negative: number;
      true_positive: number;
    };
  };
  pass_threshold: number;
  overall_pass: boolean;
}

export async function fetchAlerts(params: {
  page?: number;
  risk_level?: string;
  status?: string;
  cashier_id?: string;
  location_name?: string;
  date_from?: string;
  date_to?: string;
}): Promise<AlertsResponse> {
  const { data } = await api.get<AlertsResponse>("/api/probe/alerts", { params });
  return data;
}

export async function updateAlertStatus(alertId: string, status: string): Promise<void> {
  await api.put(`/api/probe/alerts/${alertId}/status`, { status });
}

export interface AlertExplanation {
  alert_id: string;
  explanation: string;
  pattern_summary: string;
  historical_context: {
    avg_transaction_amount: number | null;
    std_transaction_amount: number | null;
    avg_quantity: number | null;
    total_transactions_analyzed: number | null;
    peak_hours: number[];
  };
  risk_factors: string[];
  cashier_context: string | null;
}

export async function fetchAlertExplanation(alertId: string): Promise<AlertExplanation> {
  const { data } = await api.get<AlertExplanation>(`/api/probe/alerts/${alertId}/explain`);
  return data;
}

export async function fetchForecastBacktest(): Promise<BacktestResponse> {
  const { data } = await api.get<BacktestResponse>("/api/probe/forecast/backtest");
  return data;
}

export async function fetchAnomalyMetrics(): Promise<AnomalyMetricsResponse> {
  const { data } = await api.get<AnomalyMetricsResponse>("/api/probe/anomaly/metrics");
  return data;
}

export default api;
