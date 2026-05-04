export interface FYConfig {
  startMonth: number; // 1 = Jan
  startDay: number;
  format: "range" | "single"; // "FY 2025-26" vs "2025"
}

const FY_MAP: Record<string, FYConfig> = {
  IN: { startMonth: 4, startDay: 1, format: "range" },  // India: Apr–Mar
  AU: { startMonth: 7, startDay: 1, format: "range" },  // Australia: Jul–Jun
  NZ: { startMonth: 4, startDay: 1, format: "range" },  // New Zealand: Apr–Mar
  GB: { startMonth: 4, startDay: 6, format: "range" },  // UK: Apr 6 – Apr 5
  PK: { startMonth: 7, startDay: 1, format: "range" },  // Pakistan: Jul–Jun
  BD: { startMonth: 7, startDay: 1, format: "range" },  // Bangladesh: Jul–Jun
  EG: { startMonth: 7, startDay: 1, format: "range" },  // Egypt: Jul–Jun
  IR: { startMonth: 4, startDay: 1, format: "range" },  // Iran: Apr–Mar (approx)
};

const DEFAULT_CONFIG: FYConfig = { startMonth: 1, startDay: 1, format: "single" };

export function getFYConfig(countryCode?: string | null): FYConfig {
  if (!countryCode) return DEFAULT_CONFIG;
  return FY_MAP[countryCode.toUpperCase()] ?? DEFAULT_CONFIG;
}

export function getFYLabel(startYear: number, config: FYConfig): string {
  if (config.format === "range") {
    return `FY ${startYear}–${String(startYear + 1).slice(2)}`;
  }
  return String(startYear);
}

export function getFYDateRange(startYear: number, config: FYConfig): { start: string; end: string } {
  const start = new Date(Date.UTC(startYear, config.startMonth - 1, config.startDay));

  if (config.startMonth === 1 && config.startDay === 1) {
    return { start: toDateStr(start), end: `${startYear}-12-31` };
  }

  const nextFYStart = new Date(Date.UTC(startYear + 1, config.startMonth - 1, config.startDay));
  nextFYStart.setUTCDate(nextFYStart.getUTCDate() - 1);

  return { start: toDateStr(start), end: toDateStr(nextFYStart) };
}

export function getCurrentFYStartYear(config: FYConfig): number {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const beforeStart = month < config.startMonth || (month === config.startMonth && day < config.startDay);
  return beforeStart ? year - 1 : year;
}

export function getRecentFYStartYears(config: FYConfig, count = 3): number[] {
  const current = getCurrentFYStartYear(config);
  return Array.from({ length: count }, (_, i) => current - i);
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
