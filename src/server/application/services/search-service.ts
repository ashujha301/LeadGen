import type { NaturalSearchRequest, NaturalSearchResponse, OverlapResult } from "@/shared/contracts";
import { NaturalSearchError, runNaturalSearch } from "@/server/application/search";
import { findEmploymentOverlaps } from "@/server/domain";
import {
  getDb,
  listOwnedPersonIdsForCompany,
  runsRepo,
  userOwnsCompany,
  userOwnsPerson,
} from "@/server/infrastructure/db";

export const searchService = {
  async naturalSearch(
    input: NaturalSearchRequest,
    userId: string,
  ): Promise<NaturalSearchResponse> {
    const db = getDb();

    if (input.runId) {
      const run = await runsRepo.getRunByIdForUser(db, input.runId, userId);
      if (!run) {
        throw new NaturalSearchError("NOT_FOUND", "Run not found");
      }
    }

    return runNaturalSearch(input, { db, userId });
  },

  async findOverlaps(
    params: {
      companyId: string;
      personId?: string;
      minOverlapDays?: number;
    },
    userId: string,
  ): Promise<OverlapResult[]> {
    const db = getDb();

    if (!(await userOwnsCompany(db, params.companyId, userId))) {
      return [];
    }
    if (params.personId && !(await userOwnsPerson(db, params.personId, userId))) {
      return [];
    }

    const ownedPersonIds = await listOwnedPersonIdsForCompany(
      db,
      params.companyId,
      userId,
    );

    return findEmploymentOverlaps(db, {
      ...params,
      ownedPersonIds,
    });
  },
};
