import type { NaturalSearchRequest, OverlapResult } from "@/shared/contracts";
import type {
  NaturalSearchResolveRequest,
  NaturalSearchV2Response,
} from "@/shared/contracts/natural-search-v2";
import { NaturalSearchError } from "@/server/application/search/natural-search-error";
import { runNaturalSearchV2 } from "@/server/application/search/natural-search-v2";
import { resolveNaturalSearchSession } from "@/server/application/search/resolve-session";
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
    requestId?: string,
  ): Promise<NaturalSearchV2Response> {
    const db = getDb();

    if (input.runId) {
      const run = await runsRepo.getRunByIdForUser(db, input.runId, userId);
      if (!run) {
        throw new NaturalSearchError("NOT_FOUND", "Run not found");
      }
    }

    return runNaturalSearchV2(input, { db, userId, requestId });
  },

  async resolveNaturalSearch(
    sessionId: string,
    input: NaturalSearchResolveRequest,
    userId: string,
    requestId?: string,
  ): Promise<NaturalSearchV2Response> {
    const db = getDb();
    return resolveNaturalSearchSession(sessionId, input, { db, userId, requestId });
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

    const ownedPersonIds = await listOwnedPersonIdsForCompany(db, params.companyId, userId);

    return findEmploymentOverlaps(db, {
      ...params,
      ownedPersonIds,
    });
  },
};
