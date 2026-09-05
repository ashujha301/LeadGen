import type {
  NaturalSearchRequest,
  NaturalSearchResponse,
  OverlapResult,
} from "@/shared/contracts";
import { runNaturalSearch } from "@/server/application/search";
import { findEmploymentOverlaps } from "@/server/domain";
import { getDb } from "@/server/infrastructure/db";

export const searchService = {
  async naturalSearch(input: NaturalSearchRequest): Promise<NaturalSearchResponse> {
    const db = getDb();
    return runNaturalSearch(input, { db });
  },

  async findOverlaps(params: {
    companyId: string;
    personId?: string;
    minOverlapDays?: number;
  }): Promise<OverlapResult[]> {
    const db = getDb();
    return findEmploymentOverlaps(db, params);
  },
};
