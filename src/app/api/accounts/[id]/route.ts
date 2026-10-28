import { apiUser, handler, HttpError } from "@/lib/auth";
import { deleteAccount } from "@/lib/accounts";

export const DELETE = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  if (!deleteAccount(user.id, id)) throw new HttpError(404, "Account not found");
  return Response.json({ ok: true });
});
