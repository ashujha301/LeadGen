export function shouldMarkLeadStale(input: {
  candidateLeadId: string;
  candidatePersonId: string;
  candidateCompanyId: string;
  activePersonId: string;
  activeCompanyId: string;
  keepLeadId: string;
}): boolean {
  if (input.candidatePersonId !== input.activePersonId) return false;
  if (input.candidateCompanyId !== input.activeCompanyId) return false;
  if (input.candidateLeadId === input.keepLeadId) return false;
  return true;
}
