export type CurrentEmploymentRef = {
  personId: string;
  companyId: string | null;
  isCurrent: boolean;
};

export function hasCurrentEmployment(
  employments: CurrentEmploymentRef[],
  personId: string,
  companyId: string,
): boolean {
  return employments.some(
    (employment) =>
      employment.personId === personId &&
      employment.companyId === companyId &&
      employment.isCurrent,
  );
}
