import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { mapCompanyPageToObservations } from "@/server/infrastructure/connectors";
import {
  extractTextExcerpt,
  isLeadershipLikePage,
  isLeadershipPath,
} from "../../src/server/worker/stages/helpers.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/company-pages");

describe("company page fixtures", () => {
  it("extracts leadership contacts from team page fixture", () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "team.html"), "utf8");
    const observations = mapCompanyPageToObservations({
      url: "https://acme-analytics.test/team",
      finalUrl: "https://acme-analytics.test/team",
      statusCode: 200,
      contentType: "text/html",
      html,
      fetchedAt: new Date().toISOString(),
    });

    expect(observations.some((obs) => obs.attribute === "email")).toBe(true);
    expect(
      observations.some((obs) => obs.entityType === "person" && obs.rawValue === "Jordan Lee"),
    ).toBe(true);
    expect(
      observations.some((obs) => obs.entityType === "person" && obs.rawValue === "Sam Patel"),
    ).toBe(true);
    expect(extractTextExcerpt(html)).toContain("Jordan Lee");
    expect(isLeadershipPath("/team")).toBe(true);
  });

  it("extracts JSON-LD from homepage fixture", () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "homepage.html"), "utf8");
    const observations = mapCompanyPageToObservations({
      url: "https://acme-analytics.test/",
      finalUrl: "https://acme-analytics.test/",
      statusCode: 200,
      contentType: "text/html",
      html,
      fetchedAt: new Date().toISOString(),
    });

    expect(observations.some((obs) => obs.attribute === "json_ld")).toBe(true);
    expect(observations.some((obs) => obs.attribute === "page_title")).toBe(true);
  });

  it("treats homepage team sections as leadership-like pages", () => {
    expect(
      isLeadershipLikePage(
        "/",
        "The Team Meet the Brains Behind the Intelligence Tejas Pandit Co-Founder Ravi Chitloor Co-Founder",
      ),
    ).toBe(true);
  });

  it("extracts both MeshDefend co-founders from mesh-team fixture", () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "mesh-team.html"), "utf8");
    const observations = mapCompanyPageToObservations({
      url: "https://meshdefend.ai/team",
      finalUrl: "https://www.meshdefend.ai/team",
      statusCode: 200,
      contentType: "text/html",
      html,
      fetchedAt: new Date().toISOString(),
    });

    const personNames = observations
      .filter((obs) => obs.entityType === "person" && obs.attribute === "name")
      .map((obs) => obs.rawValue);

    expect(personNames).toEqual(
      expect.arrayContaining(["Tejas Pandit", "Ravi Chitloor"]),
    );
    expect(new Set(personNames).size).toBeGreaterThanOrEqual(2);
    expect(
      observations.filter(
        (obs) =>
          obs.entityType === "person" &&
          obs.attribute === "title" &&
          obs.rawValue === "Co-Founder",
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("extracts founders from visible homepage text", () => {
    const observations = mapCompanyPageToObservations({
      url: "https://meshdefend.ai/",
      finalUrl: "https://www.meshdefend.ai/",
      statusCode: 200,
      contentType: "text/html",
      html: `
        <section>
          <h2>The Team</h2>
          <h3>Tejas Pandit</h3>
          <p>Co-Founder</p>
          <h3>Ravi Chitloor</h3>
          <p>Co-Founder</p>
        </section>
      `,
      fetchedAt: new Date().toISOString(),
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "person",
          attribute: "name",
          rawValue: "Tejas Pandit",
        }),
        expect.objectContaining({
          entityType: "person",
          attribute: "name",
          rawValue: "Ravi Chitloor",
        }),
        expect.objectContaining({
          entityType: "person",
          attribute: "title",
          rawValue: "Co-Founder",
        }),
      ]),
    );
  });
});
