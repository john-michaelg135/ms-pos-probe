/**
 * Canonical variation ordering for consistent display across all pages.
 * Groups: Ube Halaya first, then Ube Jam. Within each: Smooth sizes, then Tidbits sizes.
 */

export const VARIATION_ORDER: { variation_id: number; product_name: string; variation_name: string; full_name: string }[] = [
  { variation_id: 1, product_name: "Ube Halaya", variation_name: "Smooth 200g", full_name: "Ube Halaya Smooth 200g" },
  { variation_id: 2, product_name: "Ube Halaya", variation_name: "Smooth 250g", full_name: "Ube Halaya Smooth 250g" },
  { variation_id: 3, product_name: "Ube Halaya", variation_name: "Smooth 500g", full_name: "Ube Halaya Smooth 500g" },
  { variation_id: 4, product_name: "Ube Halaya", variation_name: "Tidbits 200g", full_name: "Ube Halaya Tidbits 200g" },
  { variation_id: 5, product_name: "Ube Halaya", variation_name: "Tidbits 250g", full_name: "Ube Halaya Tidbits 250g" },
  { variation_id: 6, product_name: "Ube Halaya", variation_name: "Tidbits 500g", full_name: "Ube Halaya Tidbits 500g" },
  { variation_id: 7, product_name: "Ube Jam", variation_name: "Smooth 200g", full_name: "Ube Jam Smooth 200g" },
  { variation_id: 8, product_name: "Ube Jam", variation_name: "Smooth 250g", full_name: "Ube Jam Smooth 250g" },
  { variation_id: 9, product_name: "Ube Jam", variation_name: "Smooth 500g", full_name: "Ube Jam Smooth 500g" },
  { variation_id: 10, product_name: "Ube Jam", variation_name: "Tidbits 200g", full_name: "Ube Jam Tidbits 200g" },
  { variation_id: 11, product_name: "Ube Jam", variation_name: "Tidbits 250g", full_name: "Ube Jam Tidbits 250g" },
  { variation_id: 12, product_name: "Ube Jam", variation_name: "Tidbits 500g", full_name: "Ube Jam Tidbits 500g" },
];

/**
 * Get the sort index for a variation by its full name or variation_id.
 */
export function getVariationSortIndex(fullName?: string, variationId?: number): number {
  if (variationId) {
    const idx = VARIATION_ORDER.findIndex((v) => v.variation_id === variationId);
    return idx >= 0 ? idx : 999;
  }
  if (fullName) {
    const idx = VARIATION_ORDER.findIndex((v) => v.full_name === fullName);
    return idx >= 0 ? idx : 999;
  }
  return 999;
}
