import { describe, expect, it } from "vitest";

import {
  CRUSTDATA_CREDITS_WARNING_MESSAGE,
  CRUSTDATA_CREDITS_WARNING_TITLE,
  buildRunWarnings,
} from "@/server/application/services/run-warnings";

describe("run warnings from connector attempts", () => {
  it("creates one Crustdata credit warning when any attempt reports credit exhaustion", () => {
    const warnings = buildRunWarnings([
      {
        errorCode: "CRUSTDATA_CREDITS_EXHAUSTED",
        connectorName: "crustdata_company_enrich",
      },
      {
        errorCode: "CRUSTDATA_CREDITS_EXHAUSTED",
        connectorName: "crustdata_person_enrich",
      },
      {
        errorCode: "CRUSTDATA_ACCESS_DENIED",
        connectorName: "crustdata_person_search",
      },
    ]);

    expect(warnings).toEqual([
      {
        code: "CRUSTDATA_CREDITS_EXHAUSTED",
        provider: "crustdata",
        title: CRUSTDATA_CREDITS_WARNING_TITLE,
        message: CRUSTDATA_CREDITS_WARNING_MESSAGE,
      },
    ]);
  });

  it("returns no warning for successful or unrelated failures", () => {
    expect(
      buildRunWarnings([
        { errorCode: null, connectorName: "crustdata_company_enrich" },
        { errorCode: "CRUSTDATA_ACCESS_DENIED", connectorName: "crustdata_person_enrich" },
        { errorCode: "Request timed out", connectorName: "crustdata_person_search" },
      ]),
    ).toEqual([]);
  });

  it("does not invent warnings from empty attempt lists", () => {
    expect(buildRunWarnings([])).toEqual([]);
  });
});
