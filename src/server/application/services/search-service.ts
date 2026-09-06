import type { NaturalSearchRequest, OverlapResult } from "@/shared/contracts";
import type {
  NaturalSearchResolveRequest,
  NaturalSearchV2Response,
} from "@/shared/contracts/natural-search-v2";
import { NaturalSearchError } from "@/server/application/search/natural-search-error";
import { runNaturalSearchV2 } from "@/server/application/search/natural-search-v2";
import { resolveNaturalSearchSession } from "@/server/application/search/resolve-session";
import { potentialConnectionsService } from "@/server/application/services/potential-connections-service";
import { getDb, runsRepo, userOwnsCompany, userOwnsPerson } from "@/server/infrastructure/db";

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

    const discovered = await potentialConnectionsService.listForUser(userId, {
      minOverlapDays: params.minOverlapDays,
      includeLimited: true,
      limit: 200,
    });

    return discovered.items
      .filter((item) => {
        const involvesCurrentCompany =
          item.personA.currentCompanyId === params.companyId ||
          item.personB.currentCompanyId === params.companyId;
        const involvesSharedEmployer = item.sharedEmployer.companyId === params.companyId;
        if (!involvesCurrentCompany && !involvesSharedEmployer) {
          return false;
        }
        if (!params.personId) {
          return true;
        }
        return (
          item.personA.personId === params.personId || item.personB.personId === params.personId
        );
      })
      .map((item) => {
        const starts = item.roleSegments
          .map((segment) => segment.startDate)
          .filter((value): value is string => Boolean(value))
          .sort();
        const ends = item.roleSegments
          .map((segment) => segment.endDate)
          .filter((value): value is string => Boolean(value))
          .sort();
        return {
          personA: { id: item.personA.personId, name: item.personA.personName },
          personB: { id: item.personB.personId, name: item.personB.personName },
          company: {
            id: item.sharedEmployer.companyId ?? params.companyId,
            name: item.sharedEmployer.name,
          },
          overlapStart: starts[0] ?? null,
          overlapEnd: ends.at(-1) ?? null,
          overlapDays: item.overlapDays,
        };
      });
  },
};
