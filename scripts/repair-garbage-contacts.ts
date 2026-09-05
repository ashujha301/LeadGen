import { and, eq, isNotNull } from "drizzle-orm";

import {
  isUsableEmail,
  isUsablePhone,
  isUsableProfileUrl,
} from "@/server/domain/entity-resolution/contact-identity";
import { getDb } from "@/server/infrastructure/db";
import { contactPoints, employments, people } from "@/server/infrastructure/db/schema";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const peopleWithProfile = await db.query.people.findMany({
    where: isNotNull(people.profileUrl),
  });
  const peopleToClear = peopleWithProfile.filter(
    (person) => person.profileUrl && !isUsableProfileUrl(person.profileUrl),
  );

  const allContacts = await db.query.contactPoints.findMany();
  const contactsToDelete = allContacts.filter((contact) => {
    if (contact.type === "email") {
      return !isUsableEmail(contact.rawValue);
    }
    if (contact.type === "phone") {
      return !isUsablePhone(contact.rawValue);
    }
    if (contact.type === "linkedin") {
      return !isUsableProfileUrl(contact.rawValue);
    }
    return false;
  });

  console.log(`People with unusable profileUrl: ${peopleToClear.length}`);
  console.log(`Contact points to remove: ${contactsToDelete.length}`);
  for (const person of peopleToClear.slice(0, 20)) {
    console.log(
      `- person ${person.id} profileUrl=${JSON.stringify(person.profileUrl)} name=${person.name}`,
    );
  }

  const multiCompanyReview: Array<{
    personId: string;
    name: string;
    profileUrl: string | null;
    companyCount: number;
  }> = [];

  for (const person of peopleToClear) {
    const currentEmployments = await db
      .select({ companyId: employments.companyId })
      .from(employments)
      .where(and(eq(employments.personId, person.id), eq(employments.isCurrent, true)));
    const companyIds = new Set(currentEmployments.map((row) => row.companyId));
    if (companyIds.size >= 2) {
      multiCompanyReview.push({
        personId: person.id,
        name: person.name,
        profileUrl: person.profileUrl,
        companyCount: companyIds.size,
      });
    }
  }

  if (multiCompanyReview.length > 0) {
    console.log(
      `\nManual review: people with unusable profileUrl and current employments at 2+ companies (${multiCompanyReview.length}):`,
    );
    for (const row of multiCompanyReview) {
      console.log(
        `- ${row.personId} ${row.name} companies=${row.companyCount} profileUrl=${JSON.stringify(row.profileUrl)}`,
      );
    }
  }

  if (!apply) {
    console.log("\nReport-only. Re-run with --apply to mutate.");
    return;
  }

  for (const person of peopleToClear) {
    await db.update(people).set({ profileUrl: null }).where(eq(people.id, person.id));
  }
  for (const contact of contactsToDelete) {
    await db.delete(contactPoints).where(eq(contactPoints.id, contact.id));
  }

  console.log("Applied contact repairs.");
  console.log(
    "Employments were not auto-ended in v1; use the multi-company review list above for manual cleanup.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
