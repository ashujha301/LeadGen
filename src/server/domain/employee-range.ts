export type EmployeeRangeBounds = {
  min?: number;
  max?: number;
};

export function hasEmployeeRangeBounds(range?: EmployeeRangeBounds): boolean {
  return range?.min != null || range?.max != null;
}

export function isEmployeeCountInRange(count: number, range: EmployeeRangeBounds): boolean {
  if (range.min != null && count < range.min) {
    return false;
  }
  if (range.max != null && count > range.max) {
    return false;
  }
  return true;
}

/** True when headcount is known and outside the configured range (min-only / max-only supported). */
export function shouldExcludeByEmployeeRange(
  count: number | null | undefined,
  range?: EmployeeRangeBounds,
): boolean {
  if (count == null || !hasEmployeeRangeBounds(range)) {
    return false;
  }
  return !isEmployeeCountInRange(count, range!);
}
