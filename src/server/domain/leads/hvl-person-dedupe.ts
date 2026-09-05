export type LeadPersonKey = {
  id: string;
  personId: string;
  finalScore: number | string;
  updatedAt: Date;
};

export function pickCanonicalLeadPerPerson<T extends LeadPersonKey>(leads: T[]): T[] {
  const best = new Map<string, T>();
  for (const lead of leads) {
    const score = Number(lead.finalScore);
    const existing = best.get(lead.personId);
    if (!existing) {
      best.set(lead.personId, lead);
      continue;
    }
    const existingScore = Number(existing.finalScore);
    if (score > existingScore) {
      best.set(lead.personId, lead);
      continue;
    }
    if (score < existingScore) continue;
    if (lead.updatedAt > existing.updatedAt) {
      best.set(lead.personId, lead);
      continue;
    }
    if (lead.updatedAt < existing.updatedAt) continue;
    if (lead.id > existing.id) best.set(lead.personId, lead);
  }
  return [...best.values()];
}
