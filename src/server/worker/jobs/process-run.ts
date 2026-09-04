import { runStreamingPipeline } from "./streaming-coordinator";
import type {
  CrustdataCompanyResult,
  CrustdataPeopleSearchResult,
} from "@/server/infrastructure/connectors/types";

export type ProcessRunPayload = {
  runId: string;
};

export type StageContext = {
  runId: string;
  domain: string;
  normalizedDomain: string;
  companyId?: string;
  providerCompany?: CrustdataCompanyResult;
  providerPeople?: CrustdataPeopleSearchResult;
  providersPersisted?: boolean;
  resolvedPersonIds?: string[];
};

export type StageResult = {
  stage: string;
  success: boolean;
  metrics?: Record<string, number>;
  error?: string;
};

export async function processRun(payload: ProcessRunPayload): Promise<void> {
  await runStreamingPipeline(payload);
}
