import { describe, expect, it } from "vitest";

import { hasCurrentEmployment } from "@/server/domain/entity-resolution/current-employment";
import {
  dedupePersonDrafts,
  findExistingPersonByNameAtCompany,
} from "@/server/domain/entity-resolution/person-drafts";
import { isUniqueViolation } from "@/server/infrastructure/db/errors";

describe("current employment unique index", () => {
  it("treats an existing current row for the same person and company as a duplicate", () => {
    expect(
      hasCurrentEmployment(
        [{ personId: "p1", companyId: "c1", isCurrent: true }],
        "p1",
        "c1",
      ),
    ).toBe(true);
  });

  it("does not treat a past employment as satisfying the current unique index", () => {
    expect(
      hasCurrentEmployment(
        [{ personId: "p1", companyId: "c1", isCurrent: false }],
        "p1",
        "c1",
      ),
    ).toBe(false);
  });

  it("does not treat another person's current employment as a duplicate", () => {
    expect(
      hasCurrentEmployment(
        [{ personId: "p2", companyId: "c1", isCurrent: true }],
        "p1",
        "c1",
      ),
    ).toBe(false);
  });
});

describe("person draft identity dedupe", () => {
  it("collapses website and provider drafts that share a LinkedIn URL", () => {
    const drafts = dedupePersonDrafts([
      {
        name: "Jane Doe",
        normalizedName: "jane doe",
        title: "CEO",
        profileUrl: "https://linkedin.com/in/jane",
        confidence: 0.6,
        sourceDocumentId: "web",
        subjectKey: "page-1",
      },
      {
        name: "Jane Doe",
        normalizedName: "jane doe",
        title: "Chief Executive Officer",
        profileUrl: "https://www.linkedin.com/in/jane/",
        crustdataPersonId: "cd-1",
        confidence: 0.9,
        sourceDocumentId: "search",
        subjectKey: "crustdata:cd-1",
      },
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.crustdataPersonId).toBe("cd-1");
    expect(drafts[0]?.title).toBe("Chief Executive Officer");
  });

  it("collapses drafts that share a Crustdata person id", () => {
    const drafts = dedupePersonDrafts([
      {
        name: "Jane Doe",
        normalizedName: "jane doe",
        crustdataPersonId: "cd-1",
        confidence: 0.85,
        sourceDocumentId: "search",
        subjectKey: "crustdata:cd-1",
      },
      {
        name: "Jane D.",
        normalizedName: "jane d",
        title: "Founder",
        crustdataPersonId: "cd-1",
        confidence: 0.88,
        sourceDocumentId: "enrich",
        subjectKey: "crustdata-company-person-0",
      },
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toBe("Founder");
  });

  it("keeps distinct people with different identity keys", () => {
    const drafts = dedupePersonDrafts([
      {
        name: "Jane Doe",
        normalizedName: "jane doe",
        profileUrl: "https://linkedin.com/in/jane",
        confidence: 0.8,
        sourceDocumentId: "a",
        subjectKey: "a",
      },
      {
        name: "John Smith",
        normalizedName: "john smith",
        profileUrl: "https://linkedin.com/in/john",
        confidence: 0.8,
        sourceDocumentId: "b",
        subjectKey: "b",
      },
    ]);

    expect(drafts).toHaveLength(2);
  });

  it("does not collapse unrelated drafts that only share garbage profile urls", () => {
    const drafts = dedupePersonDrafts([
      {
        name: "Mr. Arindam Ghosh",
        normalizedName: "mr arindam ghosh",
        title: "Independent Director",
        profileUrl: "/",
        confidence: 0.95,
        sourceDocumentId: "navi",
        subjectKey: "navi-1",
      },
      {
        name: "Abhishek Kumar Singh",
        normalizedName: "abhishek kumar singh",
        title: "Founder",
        profileUrl: "/",
        confidence: 0.9,
        sourceDocumentId: "devvine",
        subjectKey: "devvine-1",
      },
    ]);

    expect(drafts).toHaveLength(2);
  });

  it("does not collapse drafts that only share garbage emails", () => {
    const drafts = dedupePersonDrafts([
      {
        name: "Ada Lovelace",
        normalizedName: "ada lovelace",
        email: "/",
        confidence: 0.8,
        sourceDocumentId: "a",
        subjectKey: "a-1",
      },
      {
        name: "Grace Hopper",
        normalizedName: "grace hopper",
        email: "/",
        confidence: 0.8,
        sourceDocumentId: "b",
        subjectKey: "b-1",
      },
    ]);

    expect(drafts).toHaveLength(2);
  });

  it("finds existing people by high name similarity at the same company", () => {
    expect(
      findExistingPersonByNameAtCompany(
        { normalizedName: "john smith" },
        [
          { id: "p1", normalizedName: "john smyth" },
          { id: "p2", normalizedName: "jane doe" },
        ],
      ),
    ).toBe("p1");
  });
});

describe("postgres unique violations", () => {
  it("detects 23505 errors, optionally by constraint name", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(
      isUniqueViolation(
        { code: "23505", constraint: "employments_current_person_company_idx" },
        "employments_current_person_company_idx",
      ),
    ).toBe(true);
    expect(
      isUniqueViolation(
        { code: "23505", constraint: "contact_points_type_normalized_value_idx" },
        "employments_current_person_company_idx",
      ),
    ).toBe(false);
    expect(isUniqueViolation(new Error("duplicate key"))).toBe(false);
  });
});
