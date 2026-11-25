// Litres for the water row (checklist m6-02, WATER_TOTAL_DESIGN.html).
// "1.25 L", "1.5 L", "0 L": at most two decimals, no trailing zeros.

export const formatLitres = (ml: number | null | undefined): string => {
  const value = Math.max(0, Number(ml) || 0) / 1000;
  const text = (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${text} L`;
};

/** 0..1 of the bar filled; a missing target shows an empty bar, never a full one. */
export const waterProgress = (totalMl: number | null | undefined, targetMl: number | null | undefined): number => {
  const target = Number(targetMl) || 0;
  if (target <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(totalMl) || 0) / target));
};

export const isWaterTargetReached = (totalMl: number | null | undefined, targetMl: number | null | undefined): boolean =>
  (Number(targetMl) || 0) > 0 && (Number(totalMl) || 0) >= (Number(targetMl) || 0);
