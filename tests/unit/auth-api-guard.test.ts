import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/features/auth/auth.config", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

describe("API auth guard", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.resetModules();
  });

  it("requireApiUser throws UnauthorizedError when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const { requireApiUser, UnauthorizedError } = await import("@/features/auth/api-guard");

    await expect(requireApiUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requireApiUser throws when session user has no id", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const { requireApiUser, UnauthorizedError } = await import("@/features/auth/api-guard");

    await expect(requireApiUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requireApiUser returns the session user id when authenticated", async () => {
    authMock.mockResolvedValue({ user: { id: "user-123", email: "a@b.com" } });
    const { requireApiUser } = await import("@/features/auth/api-guard");

    await expect(requireApiUser()).resolves.toEqual({ id: "user-123" });
  });

  it("withApiUser returns 401 UNAUTHORIZED when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const { withApiUser } = await import("@/features/auth/with-api-user");

    const response = await withApiUser("req-1", async () => new Response("ok"));
    expect(response.status).toBe(401);

    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toMatch(/authentication required/i);
  });

  it("withApiUser calls the handler with the authenticated user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-abc" } });
    const { withApiUser } = await import("@/features/auth/with-api-user");

    const response = await withApiUser("req-2", async (user) => {
      return Response.json({ userId: user.id });
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId: "user-abc" });
  });
});
