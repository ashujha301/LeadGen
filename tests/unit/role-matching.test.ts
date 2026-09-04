import { describe, expect, it } from "vitest";
import { matchTitleAgainstRoleCriteria } from "@/server/domain/roles/matching";
import type { RoleCriteria } from "@/shared/contracts/roles";

describe("role matching", () => {
  it("matches manager seniority across engineering and customer success titles", () => {
    const criteria: RoleCriteria = {
      seniorities: ["manager"],
      functions: [],
      customTitles: [],
    };

    expect(matchTitleAgainstRoleCriteria("Engineering Manager", criteria)).toEqual({
      roleMatch: true,
      roleMatchReasons: expect.arrayContaining(["seniority:manager"]),
    });
    expect(matchTitleAgainstRoleCriteria("Customer Success Manager", criteria)).toEqual({
      roleMatch: true,
      roleMatchReasons: expect.arrayContaining(["seniority:manager"]),
    });
  });

  it("requires both manager and customer_success when both groups are populated", () => {
    const criteria: RoleCriteria = {
      seniorities: ["manager"],
      functions: ["customer_success"],
      customTitles: [],
    };

    expect(matchTitleAgainstRoleCriteria("Customer Success Manager", criteria)).toEqual({
      roleMatch: true,
      roleMatchReasons: expect.arrayContaining(["seniority:manager", "function:customer_success"]),
    });
    expect(matchTitleAgainstRoleCriteria("Engineering Manager", criteria)).toEqual({
      roleMatch: false,
      roleMatchReasons: [],
    });
    expect(matchTitleAgainstRoleCriteria("Operations Manager", criteria)).toEqual({
      roleMatch: false,
      roleMatchReasons: [],
    });
  });

  it("treats custom titles with regex characters as literal phrases", () => {
    const criteria: RoleCriteria = {
      seniorities: [],
      functions: [],
      customTitles: ["VP (Sales)"],
    };

    expect(matchTitleAgainstRoleCriteria("VP (Sales)", criteria)).toEqual({
      roleMatch: true,
      roleMatchReasons: ["custom:vp (sales)"],
    });
    expect(matchTitleAgainstRoleCriteria("VP Sales Director", criteria)).toEqual({
      roleMatch: false,
      roleMatchReasons: [],
    });
    expect(matchTitleAgainstRoleCriteria("VP. Sales", criteria)).toEqual({
      roleMatch: false,
      roleMatchReasons: [],
    });
  });
});
