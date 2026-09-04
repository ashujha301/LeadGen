import type { MappedObservation } from "../types";
import type { RdapDomainResult } from "../types";

export function mapRdapToObservations(result: RdapDomainResult): MappedObservation[] {
  const observations: MappedObservation[] = [];

  if (result.registrar) {
    observations.push({
      entityType: "company",
      attribute: "registrar",
      rawValue: result.registrar,
      confidence: 0.85,
    });
  }

  if (result.createdDate) {
    observations.push({
      entityType: "company",
      attribute: "domain_created",
      rawValue: result.createdDate,
      confidence: 0.9,
    });
  }

  if (result.updatedDate) {
    observations.push({
      entityType: "company",
      attribute: "domain_updated",
      rawValue: result.updatedDate,
      confidence: 0.9,
    });
  }

  if (result.expiresDate) {
    observations.push({
      entityType: "company",
      attribute: "domain_expires",
      rawValue: result.expiresDate,
      confidence: 0.9,
    });
  }

  for (const status of result.status) {
    observations.push({
      entityType: "company",
      attribute: "domain_status",
      rawValue: status,
      confidence: 0.8,
    });
  }

  for (const nameserver of result.nameservers) {
    observations.push({
      entityType: "company",
      attribute: "nameserver",
      rawValue: nameserver,
      confidence: 0.75,
    });
  }

  return observations;
}
