import { apiUser, handler } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";

export const GET = handler(async () => {
  const user = await apiUser();
  return Response.json({ accounts: listAccounts(user.id).filter((a) => a.mode === "device") });
});
