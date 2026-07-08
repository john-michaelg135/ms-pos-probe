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
  variationId?: number
): Promise<ForecastItem[]> {
  const params: Record<string, string | number> = { days };
  if (variationId) params.variation_id = variationId;
  const { data } = await api.get<ForecastItem[]>("/api/probe/forecast", { params });
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

export default api;
