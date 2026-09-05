import { UnauthorizedError, requireApiUser } from "@/features/auth/api-guard";
import { jsonError } from "@/shared/utils/api-response";

export async function withApiUser(
  requestId: string,
  handler: (user: { id: string }) => Promise<Response>,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    return await handler(user);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonError("UNAUTHORIZED", "Authentication required", requestId, 401);
    }
    throw error;
  }
}
