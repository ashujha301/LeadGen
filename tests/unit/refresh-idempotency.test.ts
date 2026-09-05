import { describe, expect, it } from "vitest";
import { buildRefreshMetadata, planRunCreation } from "@/server/application/services/run-service";

describe("refresh idempotency", () => {
  it("returns the existing run when the same client idempotency key is retried", () => {
    expect(
      planRunCreation({
        clientIdempotencyKey: "11111111-1111-4111-8111-111111111111",
        existingByIdempotencyKey: true,
        activeRunForDomainAndIp: true,
      }),
    ).toEqual({
      kind: "return_existing_idempotency",
      reusedActiveRun: false,
    });
  });

  it("reuses the active run for the same domain and client when no idempotency match exists", () => {
    expect(
      planRunCreation({
        clientIdempotencyKey: "22222222-2222-4222-8222-222222222222",
        existingByIdempotencyKey: false,
        activeRunForDomainAndIp: true,
      }),
    ).toEqual({
      kind: "return_active_run",
      reusedActiveRun: true,
    });
  });

  it("creates a new run when neither idempotency nor active-run reuse applies", () => {
    expect(
      planRunCreation({
        clientIdempotencyKey: "33333333-3333-4333-8333-333333333333",
        existingByIdempotencyKey: false,
        activeRunForDomainAndIp: false,
      }),
    ).toEqual({ kind: "create_new" });
  });

  it("builds refresh metadata with reusedActiveRun and refreshOfRunId", () => {
    expect(
      buildRefreshMetadata(
        {
          refreshOfRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        } as never,
        true,
      ),
    ).toEqual({
      reusedActiveRun: true,
      refreshOfRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });
});
