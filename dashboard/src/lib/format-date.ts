/**
 * Consistent date formatting across the entire dashboard.
 * Standard format: MM/DD/YYYY (e.g., 07/09/2026)
 */

/**
 * Format an ISO date string (YYYY-MM-DD) or Date object to MM/DD/YYYY
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  try {
    const date = typeof input === "string" ? new Date(input + "T00:00:00") : input;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch {
    return "—";
  }
}

/**
 * Format for chart X-axis (shorter): MM/DD
 */
export function formatDateShort(input: string): string {
  try {
    const date = new Date(input + "T00:00:00");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}/${day}`;
  } catch {
    return input;
  }
}

/**
 * Format a full datetime string to MM/DD/YYYY HH:MM
 */
export function formatDateTime(input: string | null | undefined): string {
  if (!input) return "—";
  try {
    const date = new Date(input);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");
    return `${month}/${day}/${year} ${hours}:${mins}`;
  } catch {
    return "—";
  }
}
