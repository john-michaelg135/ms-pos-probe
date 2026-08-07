import { create } from "zustand";

interface AnalyticsState {
  dateFrom: string;
  dateTo: string;
  groupBy: "day" | "week" | "month";
  activeTab: string;
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setGroupBy: (groupBy: "day" | "week" | "month") => void;
  setActiveTab: (tab: string) => void;
}

function getDefaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDefaultDateTo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  dateFrom: getDefaultDateFrom(),
  dateTo: getDefaultDateTo(),
  groupBy: "day",
  activeTab: "revenue",
  setDateFrom: (date) => set({ dateFrom: date }),
  setDateTo: (date) => set({ dateTo: date }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
