import { describe, expect, it } from "vitest";

import { discoverPotentialConnections } from "@/server/domain/connections/engine";

describe("discoverPotentialConnections engine", () => {
  const asOfDate = "2024-06-01";

  it("pairs cross-company HVLs who overlapped at Groww for 335 days", () => {
    const items = discoverPotentialConnections({
      asOfDate,
      minOverlapDays: 90,
      leads: [
        {
          leadId: "lead-akul",
          personId: "akul",
          personName: "Akul Aggarwal",
          currentCompanyId: "ringg",
          currentCompanyName: "Ringg AI",
          title: "Founder",
          finalScore: 70,
          confidence: 0.8,
        },
        {
          leadId: "lead-ganesh",
          personId: "ganesh",
          personName: "Ganesh Hegde",
          currentCompanyId: "credit-dharma",
          currentCompanyName: "Credit Dharma",
          title: "Engineer",
          finalScore: 65,
          confidence: 0.8,
        },
      ],
      employments: [
        {
          personId: "akul",
          companyId: "groww",
          companyDomain: "groww.in",
          employerName: "Groww",
          employerDomain: "groww.in",
          employerLinkedinUrl: null,
          providerCompanyId: "100",
          title: "Product",
          startDate: "2020-01-01",
          endDate: "2020-12-01",
          isCurrent: false,
          hasProviderMatch: true,
          provenanceFresh: true,
        },
        {
          personId: "ganesh",
          companyId: null,
          companyDomain: null,
          employerName: "Groww",
          employerDomain: "groww.in",
          employerLinkedinUrl: null,
          providerCompanyId: null,
          title: "Engineer",
          startDate: "2020-01-01",
          endDate: "2020-12-01",
          isCurrent: false,
          hasProviderMatch: false,
          provenanceFresh: true,
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.sharedEmployer.domain).toBe("groww.in");
    expect(items[0]?.overlapDays).toBe(335);
    expect(items[0]?.personA.currentCompanyId).not.toBe(items[0]?.personB.currentCompanyId);
  });

  it("unions promotion segments for Siddharth and Ganesh at Groww (638 days)", () => {
    const items = discoverPotentialConnections({
      asOfDate,
      minOverlapDays: 90,
      leads: [
        {
          leadId: "lead-sid",
          personId: "sid",
          personName: "Siddharth Tripathi",
          currentCompanyId: "easemyshop",
          currentCompanyName: "EaseMyShop",
          title: "Founder",
          finalScore: 72,
          confidence: 0.9,
        },
        {
          leadId: "lead-ganesh",
          personId: "ganesh",
          personName: "Ganesh Hegde",
          currentCompanyId: "credit-dharma",
          currentCompanyName: "Credit Dharma",
          title: "Engineer",
          finalScore: 65,
          confidence: 0.8,
        },
      ],
      employments: [
        {
          personId: "sid",
          companyId: "groww",
          companyDomain: "groww.in",
          employerName: "Groww",
          employerDomain: "groww.in",
          employerLinkedinUrl: null,
          providerCompanyId: "100",
          title: "Engineer",
          startDate: "2018-01-01",
          endDate: "2019-06-01",
          isCurrent: false,
          hasProviderMatch: true,
          provenanceFresh: true,
        },
        {
          personId: "sid",
          companyId: "groww",
          companyDomain: "groww.in",
          employerName: "Groww",
          employerDomain: "groww.in",
          employerLinkedinUrl: null,
          providerCompanyId: "100",
          title: "Senior Engineer",
          startDate: "2019-06-01",
          endDate: "2020-01-01",
          isCurrent: false,
          hasProviderMatch: true,
          provenanceFresh: true,
        },
        {
          personId: "ganesh",
          companyId: "groww",
          companyDomain: "groww.in",
          employerName: "Groww",
          employerDomain: "groww.in",
          employerLinkedinUrl: null,
          providerCompanyId: "100",
          title: "Engineer",
          startDate: "2018-04-03",
          endDate: "2020-01-01",
          isCurrent: false,
          hasProviderMatch: true,
          provenanceFresh: true,
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.overlapDays).toBe(638);
  });

  it("excludes Rishu when timeline data is insufficient", () => {
    const items = discoverPotentialConnections({
      asOfDate,
      leads: [
        {
          leadId: "lead-rishu",
          personId: "rishu",
          personName: "Rishu Garg",
          currentCompanyId: "ringg",
          currentCompanyName: "Ringg AI",
          title: "Founder",
          finalScore: 70,
          confidence: 0.8,
        },
        {
          leadId: "lead-ganesh",
          personId: "ganesh",
          personName: "Ganesh Hegde",
          currentCompanyId: "credit-dharma",
          currentCompanyName: "Credit Dharma",
          title: "Engineer",
          finalScore: 65,
          confidence: 0.8,
        },
      ],
      employments: [
        {
          personId: "rishu",
          companyId: null,
          companyDomain: null,
          employerName: "Groww",
          employerDomain: null,
          employerLinkedinUrl: null,
          providerCompanyId: null,
          title: "Advisor",
          startDate: null,
          endDate: null,
          isCurrent: false,
          hasProviderMatch: false,
          provenanceFresh: false,
        },
        {
          personId: "ganesh",
          companyId: "groww",
          companyDomain: "groww.in",
          employerName: "Groww",
          employerDomain: "groww.in",
          employerLinkedinUrl: null,
          providerCompanyId: "100",
          title: "Engineer",
          startDate: "2018-01-01",
          endDate: "2020-01-01",
          isCurrent: false,
          hasProviderMatch: true,
          provenanceFresh: true,
        },
      ],
    });

    expect(items).toHaveLength(0);
  });
});
