import { describe, expect, it } from "vitest";
import { buildSubjectKey } from "@/server/domain";
import { mapCompanyPageToObservations } from "@/server/infrastructure/connectors";
import { collectPersonDrafts, pickCompanyName } from "@/server/worker/stages/resolve";
import { mappedToNewObservations } from "@/server/worker/stages/helpers";

const MULTI_PERSON_HTML = `<!DOCTYPE html>
<html>
  <head><title>Acme Leadership</title></head>
  <body>
    <main>
      <h1>Our Team</h1>
      <p>Jane Doe Co-Founder leads product strategy for the company.</p>
      <p>John Smith Chief Technology Officer builds the platform.</p>
    </main>
  </body>
</html>`;

describe("subject observations", () => {
  it("assigns distinct subject keys and titles for multiple people on one page", () => {
    const observations = mapCompanyPageToObservations({
      url: "https://acme.com/team",
      finalUrl: "https://acme.com/team",
      statusCode: 200,
      contentType: "text/html",
      html: MULTI_PERSON_HTML,
      fetchedAt: new Date().toISOString(),
    });

    const personNames = observations.filter(
      (obs) => obs.entityType === "person" && obs.attribute === "name",
    );
    expect(personNames).toHaveLength(2);

    const subjectKeys = new Set(personNames.map((obs) => obs.subjectKey));
    expect(subjectKeys.size).toBe(2);

    const rows = mappedToNewObservations("doc-1", observations);
    const drafts = collectPersonDrafts(
      rows.map((row, index) => ({
        id: `obs-${index}`,
        entityType: row.entityType,
        attribute: row.attribute,
        rawValue: row.rawValue,
        normalizedValue: row.normalizedValue,
        confidence: row.confidence,
        subjectKey: row.subjectKey,
      })),
      "doc-1",
    );

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.title)).toEqual(
      expect.arrayContaining(["Co-Founder", "Chief Technology Officer"]),
    );
    expect(new Set(drafts.map((draft) => draft.title)).size).toBe(2);
  });

  it("builds stable subject keys from name and index", () => {
    expect(buildSubjectKey("Jane Doe", 0)).toBe(buildSubjectKey("Jane Doe", 0));
    expect(buildSubjectKey("Jane Doe", 0)).not.toBe(buildSubjectKey("John Smith", 1));
  });

  it("rejects error-page titles when picking a company name", () => {
    const name = pickCompanyName(
      [
        { attribute: "page_title", rawValue: "404 Not Found" },
        { attribute: "page_title", rawValue: "Acme Security" },
      ],
      "acme.com",
    );

    expect(name).toBe("Acme Security");
  });
});
