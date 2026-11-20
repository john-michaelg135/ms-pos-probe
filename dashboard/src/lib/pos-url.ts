const deployedPosOrigin = "https://web-pos-alpha-vert.vercel.app";
const localPosOrigin = "https://localhost:3002";

function posOrigin(): string {
  const production = process.env.NODE_ENV === "production";
  const fallback = production ? deployedPosOrigin : localPosOrigin;
  const configured = process.env.NEXT_PUBLIC_POS_URL?.trim();
  if (!configured) return fallback;

  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol)) return fallback;
    const localHost = /^(localhost\.?|.*\.localhost\.?|127\..*|0\.0\.0\.0|\[::1\])$/i.test(url.hostname);
    if (production && (url.protocol !== "https:" || localHost)) return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

export const posSalesUrl = `${posOrigin()}/sales-processing`;
