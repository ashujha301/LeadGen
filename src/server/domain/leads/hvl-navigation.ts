export type HighValueLeadNavigation = {
  previousLeadId: string | null;
  nextLeadId: string | null;
  position: number;
  total: number;
};

export function computeLeadNeighbors(
  orderedLeadIds: string[],
  leadId: string,
): HighValueLeadNavigation | null {
  const index = orderedLeadIds.indexOf(leadId);
  if (index < 0) {
    return null;
  }
  return {
    previousLeadId: index > 0 ? (orderedLeadIds[index - 1] ?? null) : null,
    nextLeadId: index < orderedLeadIds.length - 1 ? (orderedLeadIds[index + 1] ?? null) : null,
    position: index + 1,
    total: orderedLeadIds.length,
  };
}

export function sortHighValueLeadsByScoreThenId<T extends { id: string; finalScore: number | string }>(
  leads: T[],
): T[] {
  return [...leads].sort(
    (a, b) => Number(b.finalScore) - Number(a.finalScore) || b.id.localeCompare(a.id),
  );
}
