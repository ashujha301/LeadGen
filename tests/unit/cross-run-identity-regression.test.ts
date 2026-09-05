import { describe, expect, it } from "vitest";
import {
  dedupePersonDrafts,
  profileIdentityKey,
} from "@/server/domain/entity-resolution/person-drafts";
import {
  isUsableProfileUrl,
  sanitizePersonDraftContacts,
} from "@/server/domain/entity-resolution/contact-identity";
import { matchPersons } from "@/server/domain";
import { scoreContactability } from "@/server/domain/scoring/contactability";

describe("cross-run identity regression (Navi → DevVine)", () => {
  it("does not let Navi Arindam slash identity collide with a DevVine founder draft", () => {
    const naviPerson = sanitizePersonDraftContacts({
      name: "Mr. Arindam Ghosh",
      normalizedName: "mr arindam ghosh",
      title: "Independent Director",
      profileUrl: "/",
      email: "/",
      phone: "/",
      confidence: 0.95,
      sourceDocumentId: "navi",
      subjectKey: "navi-arindam",
    });

    const devvineFounderDraft = sanitizePersonDraftContacts({
      name: "Abhishek Kumar Singh",
      normalizedName: "abhishek kumar singh",
      title: "Founder",
      profileUrl: "/", // site may emit relative junk
      confidence: 0.9,
      sourceDocumentId: "devvine",
      subjectKey: "devvine-founder",
    });

    expect(naviPerson.profileUrl).toBeUndefined();
    expect(devvineFounderDraft.profileUrl).toBeUndefined();
    expect(profileIdentityKey(naviPerson.profileUrl)).toBeNull();
    expect(isUsableProfileUrl("/")).toBe(false);

    const drafts = dedupePersonDrafts([
      { ...naviPerson, confidence: 0.95, sourceDocumentId: "navi", subjectKey: "navi-arindam" },
      {
        ...devvineFounderDraft,
        confidence: 0.9,
        sourceDocumentId: "devvine",
        subjectKey: "devvine-founder",
      },
    ]);
    expect(drafts).toHaveLength(2);

    const match = matchPersons(
      { profileUrl: "/", name: "mr arindam ghosh" },
      { profileUrl: "/", name: "abhishek kumar singh" },
    );
    expect(match.decision).not.toBe("auto_merge");

    const contactability = scoreContactability(
      {
        contacts: [
          { type: "email", value: "/" },
          { type: "phone", value: "/" },
          { type: "linkedin", value: "/" },
        ],
      },
      2,
    );
    expect(contactability.contribution).toBe(0);
  });
});
