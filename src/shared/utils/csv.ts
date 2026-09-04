import type { LeadSummary } from "@/shared/contracts";

const CSV_HEADERS = [
  "personName",
  "title",
  "companyName",
  "score",
  "confidence",
  "contactability",
  "keyReason",
  "hasEmail",
  "hasPhone",
] as const;

function escapeCsvField(value: string | number | boolean | null): string {
  if (value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function leadsToCsv(leads: LeadSummary[]): string {
  const rows = [
    CSV_HEADERS.join(","),
    ...leads.map((lead) =>
      CSV_HEADERS.map((key) => escapeCsvField(lead[key] as string | number | boolean | null)).join(
        ",",
      ),
    ),
  ];
  return rows.join("\n");
}
