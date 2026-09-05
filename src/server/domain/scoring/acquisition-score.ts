import { REASON_CODES, type ReasonCode } from "./reason-codes";
import { SCORE_COMPONENT_KEYS, SCORE_COMPONENT_LABELS, getScoreComponentMax } from "./score-config";
import {
  hasEmployeeRangeBounds,
  isEmployeeCountInRange,
  type EmployeeRangeBounds,
} from "@/server/domain/employee-range";

export type IcpFitInput = {
  targetIndustries?: string[];
  targetLocations?: string[];
  employeeRange?: EmployeeRangeBounds;
  companyIndustry?: string | null;
  companyLocation?: string | null;
  employeeCount?: number | null;
};

export type ScoreComponentResult = {
  key: string;
  weight: number;
  rawValue: number;
  contribution: number;
  reasonCode: string;
  label: string;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Company ICP fit scoring (max 20): industry, location, and employee range alignment.
 */
export function scoreCompanyIcpFit(input: IcpFitInput, scoreVersion = 1): ScoreComponentResult {
  const max = getScoreComponentMax(SCORE_COMPONENT_KEYS.companyIcpFit, scoreVersion);
  let rawValue = 0;
  let reasonCode: ReasonCode = REASON_CODES.icp.noIcpMatch;

  const industryTargets = (input.targetIndustries ?? []).map(normalizeText);
  const locationTargets = (input.targetLocations ?? []).map(normalizeText);
  const hasIcpFilters =
    industryTargets.length > 0 ||
    locationTargets.length > 0 ||
    hasEmployeeRangeBounds(input.employeeRange);

  if (!hasIcpFilters) {
    rawValue = max * 0.5;
    reasonCode = REASON_CODES.icp.partialIcp;
  } else {
    let matches = 0;
    let checks = 0;

    if (industryTargets.length > 0) {
      checks += 1;
      const companyIndustry = input.companyIndustry ? normalizeText(input.companyIndustry) : "";
      if (
        companyIndustry &&
        industryTargets.some(
          (target) => companyIndustry.includes(target) || target.includes(companyIndustry),
        )
      ) {
        matches += 1;
      }
    }

    if (locationTargets.length > 0) {
      checks += 1;
      const companyLocation = input.companyLocation ? normalizeText(input.companyLocation) : "";
      if (
        companyLocation &&
        locationTargets.some(
          (target) => companyLocation.includes(target) || target.includes(companyLocation),
        )
      ) {
        matches += 1;
      }
    }

    if (hasEmployeeRangeBounds(input.employeeRange)) {
      checks += 1;
      if (
        input.employeeCount != null &&
        isEmployeeCountInRange(input.employeeCount, input.employeeRange!)
      ) {
        matches += 1;
      }
    }

    if (checks > 0) {
      rawValue = (matches / checks) * max;
      if (matches === checks) {
        reasonCode =
          matches === 1 && industryTargets.length > 0
            ? REASON_CODES.icp.industryMatch
            : matches === 1 && locationTargets.length > 0
              ? REASON_CODES.icp.locationMatch
              : REASON_CODES.icp.employeeRangeMatch;
        if (matches > 1) {
          reasonCode = REASON_CODES.icp.industryMatch;
        }
      } else if (matches > 0) {
        reasonCode = REASON_CODES.icp.partialIcp;
      }
    }
  }

  const contribution = round(rawValue);

  return {
    key: SCORE_COMPONENT_KEYS.companyIcpFit,
    weight: getScoreComponentMax(SCORE_COMPONENT_KEYS.companyIcpFit, scoreVersion),
    rawValue: round(rawValue / max, 4),
    contribution,
    reasonCode,
    label: SCORE_COMPONENT_LABELS[SCORE_COMPONENT_KEYS.companyIcpFit],
  };
}

/** @deprecated Use scoreCompanyIcpFit. Kept for backward compatibility. */
export function scoreIcpFit(input: IcpFitInput): ScoreComponentResult {
  return scoreCompanyIcpFit(input);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
