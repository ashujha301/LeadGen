import type { LeadSummary } from "@/shared/contracts";
import { leadsToCsv } from "@/shared/utils/csv";
import { leadService } from "./lead-service";

export const exportService = {
  async exportRunLeads(runId: string): Promise<{ csv: string; count: number }> {
    const { leads } = await leadService.getLeadsForRun(runId);
    const csv = leadsToCsv(leads as LeadSummary[]);
    return { csv, count: leads.length };
  },
};