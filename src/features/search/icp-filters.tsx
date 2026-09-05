"use client";

import { useState, type KeyboardEvent } from "react";
import type { IcpFilter, RoleCriteria } from "@/shared/contracts";
import type { FunctionToken, SeniorityToken } from "@/shared/contracts/roles";
import { Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type IcpFiltersValue = IcpFilter & {
  roleCriteria?: RoleCriteria;
  /** @deprecated Legacy preset role chips; mapped to customTitles when roleCriteria is absent. */
  targetRoles?: string[];
};

type IcpFiltersProps = {
  value: IcpFiltersValue;
  onChange: (value: IcpFiltersValue) => void;
  /** Optional legacy preset roles for backward compatibility. */
  availableRoles?: readonly string[];
  compact?: boolean;
};

const SENIORITY_OPTIONS: { value: SeniorityToken; label: string }[] = [
  { value: "founder", label: "Founder" },
  { value: "owner", label: "Owner" },
  { value: "c_suite", label: "C-suite" },
  { value: "vp", label: "VP" },
  { value: "head", label: "Head" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
];

const FUNCTION_OPTIONS: { value: FunctionToken; label: string }[] = [
  { value: "executive", label: "Executive" },
  { value: "sales", label: "Sales" },
  { value: "engineering", label: "Engineering" },
  { value: "product", label: "Product" },
  { value: "marketing", label: "Marketing" },
  { value: "customer_success", label: "Customer success" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "people", label: "People / HR" },
];

const EMPTY_ROLE_CRITERIA: RoleCriteria = {
  seniorities: [],
  functions: [],
  customTitles: [],
};

function resolveRoleCriteria(value: IcpFiltersValue): RoleCriteria {
  if (value.roleCriteria) {
    return value.roleCriteria;
  }

  if (value.targetRoles?.length) {
    return {
      seniorities: [],
      functions: [],
      customTitles: [...value.targetRoles],
    };
  }

  return EMPTY_ROLE_CRITERIA;
}

function chipClass(selected: boolean) {
  return `rounded px-2 py-0.5 text-xs capitalize transition-colors ${
    selected ? "bg-accent/20 text-accent-light" : "bg-surface-raised text-muted hover:text-white"
  }`;
}

export function IcpFilters({ value, onChange, availableRoles = [], compact }: IcpFiltersProps) {
  const [customTitleInput, setCustomTitleInput] = useState("");
  const industry = value.industries?.[0] ?? "";
  const location = value.locations?.[0] ?? "";
  const employeeMin = value.employeeRange?.min?.toString() ?? "";
  const employeeMax = value.employeeRange?.max?.toString() ?? "";
  const roleCriteria = resolveRoleCriteria(value);
  const legacySelectedRoles = value.targetRoles ?? [];

  function update(partial: Partial<IcpFiltersValue>) {
    onChange({ ...value, ...partial });
  }

  function updateRoleCriteria(partial: Partial<RoleCriteria>) {
    update({
      roleCriteria: { ...roleCriteria, ...partial },
      targetRoles: undefined,
    });
  }

  function toggleSeniority(token: SeniorityToken) {
    const seniorities = roleCriteria.seniorities.includes(token)
      ? roleCriteria.seniorities.filter((item) => item !== token)
      : [...roleCriteria.seniorities, token];
    updateRoleCriteria({ seniorities });
  }

  function toggleFunction(token: FunctionToken) {
    const functions = roleCriteria.functions.includes(token)
      ? roleCriteria.functions.filter((item) => item !== token)
      : [...roleCriteria.functions, token];
    updateRoleCriteria({ functions });
  }

  function addCustomTitle(phrase: string) {
    const normalized = phrase.trim().replace(/\s+/g, " ");
    if (!normalized) return;

    const exists = roleCriteria.customTitles.some(
      (title) => title.toLowerCase() === normalized.toLowerCase(),
    );
    if (exists) {
      setCustomTitleInput("");
      return;
    }

    updateRoleCriteria({ customTitles: [...roleCriteria.customTitles, normalized] });
    setCustomTitleInput("");
  }

  function removeCustomTitle(title: string) {
    updateRoleCriteria({
      customTitles: roleCriteria.customTitles.filter((item) => item !== title),
    });
  }

  function toggleLegacyRole(role: string) {
    const roles = legacySelectedRoles.includes(role)
      ? legacySelectedRoles.filter((item) => item !== role)
      : [...legacySelectedRoles, role];
    update({ targetRoles: roles, roleCriteria: undefined });
  }

  function handleCustomTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomTitle(customTitleInput);
    }
  }

  return (
    <div
      className={`space-y-4 ${compact ? "" : "rounded-md border border-[var(--border)] bg-surface p-4"}`}
    >
      {!compact && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4 text-accent" />
          ICP filters
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="icp-industry" className="text-xs text-muted">
            Target industry preference{" "}
            <span className="text-muted/70">(optional — not the company&apos;s industry)</span>
          </label>
          <Input
            id="icp-industry"
            placeholder="B2B SaaS"
            value={industry}
            onChange={(e) => update({ industries: e.target.value ? [e.target.value] : undefined })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="icp-location" className="text-xs text-muted">
            Location
          </label>
          <Input
            id="icp-location"
            placeholder="United States"
            value={location}
            onChange={(e) => update({ locations: e.target.value ? [e.target.value] : undefined })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="icp-min-employees" className="text-xs text-muted">
            Min employees
          </label>
          <Input
            id="icp-min-employees"
            type="number"
            min={0}
            placeholder="10"
            value={employeeMin}
            onChange={(e) =>
              update({
                employeeRange: {
                  ...value.employeeRange,
                  min: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="icp-max-employees" className="text-xs text-muted">
            Max employees
          </label>
          <Input
            id="icp-max-employees"
            type="number"
            min={1}
            placeholder="500"
            value={employeeMax}
            onChange={(e) =>
              update({
                employeeRange: {
                  ...value.employeeRange,
                  max: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted">Seniority</label>
        <div className="flex flex-wrap gap-1.5">
          {SENIORITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleSeniority(option.value)}
              className={chipClass(roleCriteria.seniorities.includes(option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted">Function</label>
        <div className="flex flex-wrap gap-1.5">
          {FUNCTION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleFunction(option.value)}
              className={chipClass(roleCriteria.functions.includes(option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="icp-custom-role" className="text-xs text-muted">
          Custom role phrases
        </label>
        <Input
          id="icp-custom-role"
          placeholder="Type a title phrase and press Enter"
          value={customTitleInput}
          onChange={(e) => setCustomTitleInput(e.target.value)}
          onKeyDown={handleCustomTitleKeyDown}
        />
        {roleCriteria.customTitles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {roleCriteria.customTitles.map((title) => (
              <span
                key={title}
                className="inline-flex items-center gap-1 rounded bg-surface-raised px-2 py-0.5 text-xs text-muted"
              >
                {title}
                <button
                  type="button"
                  aria-label={`Remove ${title}`}
                  onClick={() => removeCustomTitle(title)}
                  className="rounded hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {availableRoles.length > 0 && !value.roleCriteria && (
        <div className="space-y-2">
          <label className="text-xs text-muted">Legacy target roles</label>
          <div className="flex flex-wrap gap-1.5">
            {availableRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleLegacyRole(role)}
                className={chipClass(legacySelectedRoles.includes(role))}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function buildRoleCriteriaPayload(value: IcpFiltersValue): RoleCriteria | undefined {
  const criteria = resolveRoleCriteria(value);
  const hasCriteria =
    criteria.seniorities.length > 0 ||
    criteria.functions.length > 0 ||
    criteria.customTitles.length > 0;

  return hasCriteria ? criteria : undefined;
}
